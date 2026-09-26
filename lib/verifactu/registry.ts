import type {Database} from 'sql.js';
import {exclusive,readDatabase,persistDatabase} from '../local/runtime';
import {selectedWorkspaceId} from '../local/storage';
import {digest,fullNumber,totals,type InvoiceRecord} from './model';
import {checkChain,recordsFromDatabase} from './store';
import {parseRegistryEvent,validPracticeId,validRegistryId,validWriteKey,type RegistryEvent,type RegistryLookup,type RegistryReceipt} from '../../services/verifactu-registry/protocol';
type Identity={practice_id:string;write_key:string;acknowledged_id:string;acknowledged_hash:string;received_at:string};
export type RegistryState={practiceId:string;acknowledgedId:string;acknowledgedHash:string;receivedAt:string;pending:number};
const EMPTY:RegistryState={practiceId:'',acknowledgedId:'',acknowledgedHash:'',receivedAt:'',pending:0};
function identity(db:Database):Identity|undefined{const s=db.prepare('SELECT * FROM vf_registry WHERE id=1');try{return s.step()?s.getAsObject() as unknown as Identity:undefined;}finally{s.free();}}
const practiceId=(key:string)=>digest('aula-verifactu-practice-v1:'+key);
export function validateRegistryBackup(db:Database){
 const row=identity(db);if(!row)return;
 if(!validWriteKey(row.write_key)||practiceId(row.write_key)!==row.practice_id)throw Error('La identificación del registro compartido de la copia no es válida.');
 const records=recordsFromDatabase(db);
 if(row.acknowledged_id){if(!records.some(r=>r.id===row.acknowledged_id&&r.hash===row.acknowledged_hash)||!Number.isFinite(Date.parse(row.received_at)))throw Error('La confirmación del registro compartido no coincide con la copia.');}
 else if(row.acknowledged_hash||row.received_at)throw Error('La confirmación del registro compartido está incompleta.');
}
function state(db:Database):RegistryState{const row=identity(db),records=recordsFromDatabase(db);if(!row)return {...EMPTY,pending:records.length};const at=records.findIndex(r=>r.id===row.acknowledged_id);return {practiceId:row.practice_id,acknowledgedId:row.acknowledged_id,acknowledgedHash:row.acknowledged_hash,receivedAt:row.received_at,pending:records.length-at-1};}
export function registryState(id=selectedWorkspaceId()){return exclusive(async()=>{const db=await readDatabase(id);try{return state(db);}finally{db.close();}},id);}
export async function registryUrl():Promise<string|null>{
 const base=typeof document==='undefined'?'https://simulacion.sandramangas.com/':document.baseURI;
 const response=await fetch(new URL('./verifactu-registry.json',base),{cache:'no-store',signal:AbortSignal.timeout(8000),credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('No se ha podido consultar la configuración del registro compartido.');
 const config=await response.json();if(config.version!==1||typeof config.url!=='string')throw Error('Configuración del registro compartido no válida.');
 if(!config.url)return null;
 const u=new URL(config.url),local=['localhost','127.0.0.1'].includes(u.hostname);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.protocol!=='https:'&&!(u.protocol==='http:'&&local))throw Error('Dirección del registro compartido no válida.');
 return u.origin;
}
export function publicEvent(r:InvoiceRecord):RegistryEvent{return parseRegistryEvent({version:1,id:r.id,invoice:{id:r.invoiceId,nif:r.payload.invoice.issuer.nif,number:fullNumber(r.payload.invoice),date:r.payload.invoice.date,total:totals(r.payload.invoice).total.toFixed(2)},hash:r.hash,previousHash:r.previousHash,kind:r.kind,status:r.status,createdAt:r.createdAt,signed:!!r.payload.signature?.conform});}
async function request(url:string,options:RequestInit={}){
 let response:Response;
 try{response=await fetch(url,{...options,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});}catch{throw Error('No se ha podido contactar con el registro compartido. Conserva la práctica y reintenta el envío cuando tengas conexión.');}
 let data:any;try{data=await response.json();}catch{throw Error('El registro compartido ha devuelto una respuesta no válida.');}
 if(!response.ok)throw Error(typeof data.error==='string'?data.error:'No se ha podido consultar el registro compartido.');
 return data;
}
function validReceipt(r:RegistryReceipt,p:string){return r&&r.practiceId===p&&validRegistryId(r.recordId)&&validPracticeId(r.hash)&&typeof r.receivedAt==='string'&&Number.isFinite(Date.parse(r.receivedAt));}
export async function lookupRegistry(p:string,id:string):Promise<RegistryLookup>{
 if(!validPracticeId(p)||!validRegistryId(id))throw Error('El enlace de cotejo no es válido.');
 const url=await registryUrl();if(!url)throw Error('El registro compartido todavía no está conectado.');
 const value=await request(`${url}/v1/practices/${p}/invoices/${id}`) as RegistryLookup;
 if(!validReceipt(value,p)||value.invoice?.id!==id)throw Error('La respuesta de cotejo no corresponde a esta factura.');
 parseRegistryEvent({version:1,id:value.recordId,invoice:value.invoice,hash:value.hash,previousHash:'',kind:value.kind,status:value.status,createdAt:value.createdAt,signed:value.signed});
 return value;
}
export async function syncRegistry(id=selectedWorkspaceId()):Promise<RegistryState|null>{
 const url=await registryUrl();if(!url)return null;
 // Capture the workspace before network access. Serialise with restore, reset and
 // emission, including other tabs. Persist each receipt so retries are idempotent.
 return exclusive(async()=>{
  const db=await readDatabase(id);
  try{
   const records=recordsFromDatabase(db);if(!checkChain(records))throw Error('El historial local no supera la comprobación de integridad.');
   if(!records.length)return state(db);
   let row=identity(db);
   if(!row){const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');db.run('INSERT INTO vf_registry(id,practice_id,write_key) VALUES(1,?,?)',[practiceId(key),key]);await persistDatabase(db.export(),{},id);row=identity(db)!;}
   validateRegistryBackup(db);
   const at=records.findIndex(r=>r.id===row.acknowledged_id);
   for(const r of records.slice(at+1)){
    const result=await request(`${url}/v1/practices/${row.practice_id}/records`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+row.write_key},body:JSON.stringify(publicEvent(r))}) as RegistryReceipt;
    if(!validReceipt(result,row.practice_id)||result.recordId!==r.id||result.hash!==r.hash)throw Error('La confirmación recibida no corresponde al registro enviado.');
    db.run('UPDATE vf_registry SET acknowledged_id=?,acknowledged_hash=?,received_at=? WHERE id=1',[result.recordId,result.hash,result.receivedAt]);await persistDatabase(db.export(),{},id);
   }
   return state(db);
  }finally{db.close();}
 },id);
}
