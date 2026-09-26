import {matchesRegistryInvoice,parseRegistryEvent,validPracticeId,validRegistryId,validWriteKey,type RegistryEvent} from './protocol';

type Statement={bind(...args:(string|number)[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<{meta:{changes:number}}>};
export type RegistryDatabase={prepare(sql:string):Statement;batch(statements:Statement[]):Promise<{meta:{changes:number}}[]>};
export type Env={DB:RegistryDatabase;ALLOWED_ORIGINS:string};
type Stored={record_id:string;hash:string;fingerprint:string;received_at:string;data:string};
class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
const encode=new TextEncoder();
async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(text))),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
const receipt=(practiceId:string,r:Stored)=>({practiceId,recordId:r.record_id,hash:r.hash,receivedAt:r.received_at});
async function body(request:Request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HttpError(415,'Envía un registro JSON.');
 if(Number(request.headers.get('Content-Length')||0)>8192)throw new HttpError(413,'Registro demasiado grande.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Falta el registro.');
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new HttpError(413,'Registro demasiado grande.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return parseRegistryEvent(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch(e){throw new HttpError(400,(e as Error).message);}
}
async function put(request:Request,env:Env,practiceId:string){
 const key=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!validWriteKey(key)||await hash('aula-verifactu-practice-v1:'+key)!==practiceId)throw new HttpError(403,'Esta práctica no puede modificar ese registro.');
 const event=await body(request),data=JSON.stringify(event),fingerprint=await hash(data);
 const existing=()=>env.DB.prepare('SELECT * FROM registry_records WHERE practice_id=? AND record_id=?').bind(practiceId,event.id).first<Stored>();
 const previous=await existing();if(previous){if(previous.fingerprint!==fingerprint)throw new HttpError(409,'Un registro enviado no se puede sustituir.');return receipt(practiceId,previous);}
 const head=await env.DB.prepare('SELECT last_hash,record_count FROM registry_practices WHERE id=?').bind(practiceId).first<{last_hash:string;record_count:number}>();
 if((head?.last_hash||'')!==event.previousHash)throw new HttpError(409,'El historial compartido ha avanzado o faltan registros anteriores. Importa la copia más reciente de esta práctica.');
 if((head?.record_count||0)>=5000)throw new HttpError(429,'Esta práctica ha alcanzado el límite de 5.000 registros.');
 const own=await env.DB.prepare('SELECT data FROM registry_records WHERE practice_id=? AND invoice_id=? ORDER BY position DESC LIMIT 1').bind(practiceId,event.invoice.id).first<{data:string}>();
 const last:RegistryEvent|undefined=own?JSON.parse(own.data):undefined;
 if(event.kind==='alta'&&last||event.kind!=='alta'&&!last||last?.kind==='anulacion'||last&&!matchesRegistryInvoice(last.invoice,event.invoice)||event.kind==='subsanacion'&&last?.status==='Correcto')throw new HttpError(409,'La actuación no corresponde al estado de la factura.');
 const now=new Date().toISOString();
 const statements=[
  env.DB.prepare('INSERT OR IGNORE INTO registry_practices(id,created_at) VALUES(?,?)').bind(practiceId,now),
  env.DB.prepare(`INSERT INTO registry_records(practice_id,record_id,invoice_id,position,hash,fingerprint,received_at,data)
   SELECT id,?,?,record_count+1,?,?,?,? FROM registry_practices
   WHERE id=? AND last_hash=? AND record_count<5000 AND (SELECT records FROM registry_quota WHERE id=1)<100000`)
   .bind(event.id,event.invoice.id,event.hash,fingerprint,now,data,practiceId,event.previousHash),
  env.DB.prepare(`UPDATE registry_quota SET records=records+1 WHERE id=1 AND EXISTS
   (SELECT 1 FROM registry_practices p JOIN registry_records r ON p.id=r.practice_id
    WHERE p.id=? AND p.last_hash=? AND r.record_id=? AND r.fingerprint=?)`).bind(practiceId,event.previousHash,event.id,fingerprint),
  env.DB.prepare(`UPDATE registry_practices SET last_hash=?,record_count=record_count+1 WHERE id=? AND last_hash=?
   AND EXISTS(SELECT 1 FROM registry_records WHERE practice_id=? AND record_id=? AND fingerprint=?)`).bind(event.hash,practiceId,event.previousHash,practiceId,event.id,fingerprint),
 ];
 try{const results=await env.DB.batch(statements);if(results[1].meta.changes!==1){const q=await env.DB.prepare('SELECT records FROM registry_quota WHERE id=1').first<{records:number}>();if((q?.records||0)>=100000)throw new HttpError(503,'El registro compartido ha alcanzado su capacidad. Conserva la copia local.');throw new HttpError(409,'El historial ha cambiado durante el envío. Reintenta la sincronización.');}}
 catch(error){const saved=await existing();if(saved?.fingerprint===fingerprint)return receipt(practiceId,saved);throw error instanceof HttpError?error:new HttpError(409,'No se ha podido incorporar el registro. Reintenta la sincronización.');}
 return receipt(practiceId,(await existing())!);
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean),headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'});
  if(origin&&allowed.includes(origin)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');headers.set('Access-Control-Max-Age','600');}
  const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(origin&&!allowed.includes(origin))throw new HttpError(403,'Origen no autorizado.');
   const url=new URL(request.url);if(url.search)throw new HttpError(400,'Ruta de consulta no válida.');
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(request.method==='GET'&&url.pathname==='/health'){await env.DB.prepare('SELECT records FROM registry_quota WHERE id=1').first();return json({service:'aula-verifactu-registry',version:1,mode:'educational'});}
   const match=url.pathname.match(/^\/v1\/practices\/([^/]+)\/(records|invoices\/([^/]+))$/);
   if(!match||!validPracticeId(match[1]))throw new HttpError(404,'Consulta no disponible.');
   const practiceId=match[1];
   if(request.method==='POST'&&match[2]==='records')return json(await put(request,env,practiceId));
   if(request.method==='GET'&&validRegistryId(match[3])){
    const row=await env.DB.prepare('SELECT * FROM registry_records WHERE practice_id=? AND invoice_id=? ORDER BY position DESC LIMIT 1').bind(practiceId,match[3]).first<Stored>();
    if(!row)throw new HttpError(404,'Esta factura todavía no consta en el registro compartido.');
    const e=parseRegistryEvent(JSON.parse(row.data));return json({...receipt(practiceId,row),invoice:e.invoice,kind:e.kind,status:e.status,createdAt:e.createdAt,signed:e.signed});
   }
   throw new HttpError(405,'Operación no permitida.');
  }catch(error){return json({error:error instanceof HttpError?error.message:'El registro compartido no está disponible. Inténtalo más tarde.'},error instanceof HttpError?error.status:503);}
 }
};
