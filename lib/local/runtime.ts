import initSqlJs,{type Database,type SqlJsStatic,type SqlValue} from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
const schemaFiles=Object.entries(import.meta.glob('../../schema/*.sql',{query:'?raw',import:'default',eager:true})).sort(([a],[b])=>a.localeCompare(b));
let engine:Promise<SqlJsStatic>|undefined;
let storage:Promise<IDBDatabase>|undefined;
export function sqlEngine(){return engine??=initSqlJs({locateFile:()=>wasmUrl});}
export function setEngineForTests(value:SqlJsStatic){engine=Promise.resolve(value);}
export async function freshDatabase(){const SQL=await sqlEngine(),db=new SQL.Database();for(const [,sql] of schemaFiles)db.run(sql as string);db.run('PRAGMA foreign_keys=ON');return db;}
function localStore(){return storage??=new Promise((resolve,reject)=>{const request=indexedDB.open('aula-simulacion-v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('state');request.result.createObjectStore('files');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{storage=undefined;reject(Error('El navegador no permite guardar la práctica. Comprueba los permisos de almacenamiento.'));};});}
export async function readStore<T>(store:string,key:string){const db=await localStore();return new Promise<T|undefined>((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result as T);r.onerror=()=>reject(r.error);});}
export type StoredFile={bytes:Uint8Array;type:string};
let active:LocalDatabase|null=null;
let written=new Map<string,StoredFile>(),deleted=new Set<string>();
export class LocalStatement{
 constructor(readonly owner:LocalDatabase,readonly sql:string,readonly args:SqlValue[]=[]){ }
 bind(...values:unknown[]){return new LocalStatement(this.owner,this.sql,values.map(v=>v===undefined?null:typeof v==='boolean'?Number(v):v) as SqlValue[]);}
 execute<T>(){const s=this.owner.db.prepare(this.sql);try{s.bind(this.args);const results:T[]=[];while(s.step())results.push(s.getAsObject() as T);const changes=this.owner.db.getRowsModified();if(!/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(this.sql))this.owner.dirty=true;return {results,success:true,meta:{changes,last_row_id:Number(this.owner.db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0]||0)}};}finally{s.free();}}
 async all<T=Record<string,unknown>>(){return this.execute<T>();}
 async first<T=Record<string,unknown>>(column?:string):Promise<T|null>{const row=this.execute<Record<string,unknown>>().results[0];return (row?(column?row[column]:row):null) as T|null;}
 async run(){return this.execute<Record<string,unknown>>();}
}
export class LocalDatabase{
 dirty=false;
 constructor(readonly db:Database){}
 prepare(sql:string){return new LocalStatement(this,sql);}
 async batch(statements:LocalStatement[]){this.db.run('SAVEPOINT local_batch');try{const result=statements.map(s=>s.execute<Record<string,unknown>>());this.db.run('RELEASE local_batch');return result;}catch(e){this.db.run('ROLLBACK TO local_batch');this.db.run('RELEASE local_batch');throw e;}}
}
export const env={
 get DB(){if(!active)throw Error('La práctica no está abierta.');return active;},
 BUCKET:{
  async get(key:string){const f=deleted.has(key)?undefined:written.get(key)||await readStore<StoredFile>('files',key);return f?{body:new Uint8Array(f.bytes).buffer,size:f.bytes.byteLength,arrayBuffer:async()=>f.bytes.slice().buffer}:null;},
  async put(key:string,data:ArrayBuffer|Uint8Array,options?:{httpMetadata?:{contentType?:string}}){written.set(key,{bytes:new Uint8Array(data).slice(),type:options?.httpMetadata?.contentType||'application/octet-stream'});deleted.delete(key);},
  async delete(keys:string|string[]){for(const key of Array.isArray(keys)?keys:[keys]){written.delete(key);deleted.add(key);}},
 },
};
let queue:Promise<unknown>=Promise.resolve();
export function exclusive<T>(task:()=>Promise<T>):Promise<T>{const next=queue.catch(()=>undefined).then(async()=>{if(globalThis.navigator?.locks)return await navigator.locks.request<Promise<T>>('aula-simulacion-v1',task);return await task();});queue=next;return next;}
export async function persistDatabase(bytes:Uint8Array,options:{replaceFiles?:boolean;files?:Map<string,StoredFile>;remove?:Set<string>}={}){
 const db=await localStore();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['state','files'],'readwrite');tx.objectStore('state').put(bytes,'database');const files=tx.objectStore('files');if(options.replaceFiles)files.clear();for(const key of options.remove||[])files.delete(key);for(const [key,file] of options.files||[])files.put(file,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('No se pudo guardar la práctica.'));tx.onerror=()=>{};});
}
export async function readDatabase(){const bytes=await readStore<Uint8Array>('state','database'),SQL=await sqlEngine(),db=bytes?new SQL.Database(bytes):await freshDatabase();db.run('PRAGMA foreign_keys=ON');return db;}
export async function allFiles(){const db=await localStore();return new Promise<Map<string,StoredFile>>((resolve,reject)=>{const tx=db.transaction('files','readonly'),s=tx.objectStore('files'),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve(new Map(keys.result.map((k,i)=>[String(k),values.result[i]])));tx.onerror=()=>reject(tx.error);});}
export function runLocal(task:()=>Promise<Response>){return exclusive(async()=>{
 const db=await readDatabase();active=new LocalDatabase(db);written=new Map();deleted=new Set();
 try{const response=await task();if(response.ok&&(active.dirty||written.size||deleted.size))await persistDatabase(db.export(),{files:written,remove:deleted});return response;}
 finally{active=null;written.clear();deleted.clear();db.close();}
 });}
