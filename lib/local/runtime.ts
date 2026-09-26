import verifactuSchema from '../../schema/0014_verifactu.sql?raw';
import documentationSchema from '../../schema/0012_documentation.sql?raw';
import initSqlJs,{type Database,type SqlJsStatic,type SqlValue} from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {selectedWorkspaceId,storageWorkspaceId,validWorkspaceId,withWorkspace} from './storage';
const schemaFiles=Object.entries(import.meta.glob('../../schema/*.sql',{query:'?raw',import:'default',eager:true})).sort(([a],[b])=>a.localeCompare(b));
let engine:Promise<SqlJsStatic>|undefined;
const storage=new Map<string,Promise<IDBDatabase>>();
export function sqlEngine(){return engine??=initSqlJs({locateFile:()=>wasmUrl});}
export function setEngineForTests(value:SqlJsStatic){engine=Promise.resolve(value);}
export async function freshDatabase(){const SQL=await sqlEngine(),db=new SQL.Database();for(const [,sql] of schemaFiles)db.run(sql as string);db.run('PRAGMA foreign_keys=ON');return db;}
export function workspaceDatabaseName(id:string){if(!validWorkspaceId(id))throw Error('La empresa seleccionada no es válida.');return id==='legacy'?'aula-simulacion-v1':`aula-simulacion-workspace-v1:${id}`;}
function localStore(id=storageWorkspaceId()){
 const name=workspaceDatabaseName(id),cached=storage.get(name);if(cached)return cached;
 const pending=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('state');request.result.createObjectStore('files');};
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();storage.delete(name);};resolve(request.result);};
  request.onerror=()=>{storage.delete(name);reject(Error('El navegador no permite guardar la práctica. Comprueba los permisos de almacenamiento.'));};
 });storage.set(name,pending);return pending;
}
export async function readStore<T>(store:string,key:string,id=storageWorkspaceId()){const db=await localStore(id);return new Promise<T|undefined>((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result as T);r.onerror=()=>reject(r.error);});}
export async function hasLegacyPractice():Promise<boolean>{
 // Abort creation on a fresh browser: discovering old data must not manufacture
 // a legacy database or mutate any existing learner records.
 const existing=await new Promise<IDBDatabase|null>((resolve,reject)=>{
  const request=indexedDB.open(workspaceDatabaseName('legacy'));let absent=false;
  request.onupgradeneeded=()=>{absent=true;request.transaction!.abort();};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>absent?resolve(null):reject(Error('No se ha podido comprobar la práctica anterior.'));
 });
 if(!existing)return false;
 let state:{bytes:Uint8Array|undefined;count:number};
 try{
  if(!existing.objectStoreNames.contains('state')||!existing.objectStoreNames.contains('files'))return true;
  state=await new Promise((resolve,reject)=>{const tx=existing.transaction(['state','files'],'readonly'),bytes=tx.objectStore('state').get('database'),files=tx.objectStore('files').count();tx.oncomplete=()=>resolve({bytes:bytes.result,count:files.result});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 }finally{existing.close();}
 if(state.count)return true;if(!state.bytes)return false;
 let db:Database|undefined;
 try{
  const SQL=await sqlEngine();db=new SQL.Database(state.bytes);
  const names=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values||[];
  return names.some(([name])=>!['mail_rate_limits','practice_guards'].includes(String(name))&&!!db!.exec(`SELECT 1 FROM "${String(name).replace(/"/g,'""')}" LIMIT 1`).length);
 }catch{return true;/* Preserve even an unreadable old database as a legacy entry. */}
 finally{db?.close();}
}
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
export function exclusive<T>(task:()=>Promise<T>,id=selectedWorkspaceId()):Promise<T>{
 const next=queue.catch(()=>undefined).then(async()=>{
  const scoped=()=>withWorkspace(id,task);
  if(globalThis.navigator?.locks)return await navigator.locks.request<Promise<T>>(workspaceDatabaseName(id),scoped);
  return await scoped();
 });queue=next;return next;
}
export async function persistDatabase(bytes:Uint8Array,options:{replaceFiles?:boolean;files?:Map<string,StoredFile>;remove?:Set<string>}={},id=storageWorkspaceId()){
 const db=await localStore(id);await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['state','files'],'readwrite');tx.objectStore('state').put(bytes,'database');const files=tx.objectStore('files');if(options.replaceFiles)files.clear();for(const key of options.remove||[])files.delete(key);for(const [key,file] of options.files||[])files.put(file,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('No se pudo guardar la práctica.'));tx.onerror=()=>{};});
}
export async function readDatabase(id=storageWorkspaceId()){
 const bytes=await readStore<Uint8Array>('state','database',id),SQL=await sqlEngine(),db=bytes?new SQL.Database(bytes):await freshDatabase();
 try{
  // Existing v1 practices predate the additive signature migration. JSON null means
  // "no captured signature"; never invent one for historical messages.
  if(!db.exec('PRAGMA table_info(mail_messages)')[0].values.some(row=>row[1]==='corporate_signature'))db.run("ALTER TABLE mail_messages ADD corporate_signature TEXT NOT NULL DEFAULT 'null'");
  db.run(documentationSchema);
  db.run(verifactuSchema);
  if(!db.exec('PRAGMA table_info(bank_batches)')[0].values.some(row=>row[1]==='receipt_details'))db.run("ALTER TABLE bank_batches ADD receipt_details TEXT NOT NULL DEFAULT 'null'");
  db.run('PRAGMA foreign_keys=ON');return db;
 }catch(error){db.close();throw error;}
}
export async function allFiles(id=storageWorkspaceId()){const db=await localStore(id);return new Promise<Map<string,StoredFile>>((resolve,reject)=>{const tx=db.transaction('files','readonly'),s=tx.objectStore('files'),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve(new Map(keys.result.map((k,i)=>[String(k),values.result[i]])));tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export function runLocal(task:()=>Promise<Response>){const id=selectedWorkspaceId();return exclusive(async()=>{
 const db=await readDatabase(id);active=new LocalDatabase(db);written=new Map();deleted=new Set();
 try{const response=await task();if(response.ok&&(active.dirty||written.size||deleted.size))await persistDatabase(db.export(),{files:written,remove:deleted},id);return response;}
 finally{active=null;written.clear();deleted.clear();db.close();}
 },id);}
