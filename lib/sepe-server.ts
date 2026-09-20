import {companyId,companyProfile} from './company-server';
import {env} from '@/lib/local/runtime';
import {sepePdfResponse} from './sepe-receipt-pdf';
import {canonicalContracts,contractIdentity,parseContractXml,SepeError,sepeValidDate} from './sepe-xml';
import type {SepeBatch,SepeContract,SepeDuplicate} from './sepe-types';
const columns='b.id,b.reference,b.filename,b.count,b.communication_date AS communicationDate,b.created_at AS createdAt,b.warnings';
type BatchRow=Omit<SepeBatch,'warnings'>&{warnings:string};
const clean=(b:BatchRow):SepeBatch=>({...b,...(b.hasXml===undefined?{}:{hasXml:!!b.hasXml}),warnings:JSON.parse(b.warnings)});
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function db(){if(!env.DB)throw new SepeError('El servicio no está disponible temporalmente. Vuelve a intentarlo.',503);return env.DB;}
function bucket(){if(!env.BUCKET)throw new SepeError('No se puede conservar el archivo en este momento. Vuelve a intentarlo.',503);return env.BUCKET;}
function uuid(v:unknown){if(typeof v!=='string'||! /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v))throw new SepeError('Referencia de comunicación no válida.');return v;}
async function sha(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
async function boundary(run:()=>Promise<Response>){try{return await run();}catch(e){if(e instanceof SepeError)return json({error:e.message,...(e.batchId?{batchId:e.batchId}:{})},e.status);console.error('SEPE operation failed',e instanceof Error?e.message:'Unknown error');return json({error:'No se ha podido completar la comunicación. Conserva el fichero y vuelve a intentarlo.'},503);}}
async function payload(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new SepeError('Abre el trámite desde la central de servicios.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new SepeError('Formato de envío no admitido.',415);
 const max=1450000;if(Number(request.headers.get('content-length')||0)>max)throw new SepeError('El XML no puede superar 1 MB.',413);
 const reader=request.body?.getReader();if(!reader)throw new SepeError('Faltan los datos de la comunicación.');
 const parts:Uint8Array[]=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new SepeError('El XML no puede superar 1 MB.',413);}parts.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const p of parts){buffer.set(p,offset);offset+=p.length;}
 try{const p=JSON.parse(new TextDecoder().decode(buffer));if(!p||typeof p!=='object'||Array.isArray(p))throw 0;return p as Record<string,unknown>;}catch{throw new SepeError('No se han podido leer los datos de la comunicación.');}
}
async function stored(id:string){return db().prepare(`SELECT ${columns},b.fingerprint,b.xml_key AS xmlKey FROM sepe_batches b WHERE b.company_id=? AND b.id=?`).bind(companyId(),id).first<BatchRow&{fingerprint:string;xmlKey:string}>();}
async function receipt(id:string){const b=await stored(id);if(!b)throw new SepeError('No se encuentra la comunicación.',404);const rows=await db().prepare('SELECT data FROM sepe_contracts WHERE company_id=? AND batch_id=? ORDER BY line').bind(companyId(),id).all<{data:string}>();const {fingerprint,xmlKey,...publicBatch}=b;return {batch:{...clean(publicBatch),hasXml:!!xmlKey},contracts:rows.results.map(r=>JSON.parse(r.data) as SepeContract)};}
async function duplicates(keys:string[]){return (await db().prepare(`SELECT c.batch_id AS batchId,b.reference,c.name FROM sepe_contracts c JOIN sepe_batches b ON b.id=c.batch_id WHERE c.company_id=? AND c.identity_key IN (SELECT value FROM json_each(?))`).bind(companyId(),JSON.stringify(keys)).all<SepeDuplicate>()).results;}

export function readSepe(request:Request){return boundary(async()=>{
 const url=new URL(request.url),id=url.searchParams.get('batch');
 if(id){uuid(id);if(url.searchParams.get('xml')==='1'){
  const row=await stored(id);if(!row)throw new SepeError('No se encuentra la comunicación.',404);
  if(!row.xmlKey)throw new SepeError('El XML no se conserva. Puede descargar el justificante de la comunicación.',404);
  const file=await bucket().get(row.xmlKey);if(!file)throw new SepeError('El XML no está disponible temporalmente.',503);
  const name=encodeURIComponent(row.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="contratos.xml"; filename*=UTF-8''${name}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }const data=await receipt(id);return url.searchParams.get('pdf')==='1'?sepePdfResponse(data):json(data);}
 const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>10000)throw new SepeError('Página no válida.');
 const q=(url.searchParams.get('q')||'').trim().slice(0,120).replace(/[\\%_]/g,'\\$&'),from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 if(from)sepeValidDate(from);if(to)sepeValidDate(to);if(from&&to&&from>to)throw new SepeError('La fecha inicial debe ser anterior a la final.');
 let where='b.company_id=?';const args:(string|number)[]=[companyId()];
 if(from){where+=' AND b.communication_date>=?';args.push(from);}if(to){where+=' AND b.communication_date<=?';args.push(to);}
 if(q){where+=" AND (b.reference LIKE ? ESCAPE '\\' OR b.filename LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM sepe_contracts c WHERE c.batch_id=b.id AND (c.name LIKE ? ESCAPE '\\' OR c.person_id LIKE ? ESCAPE '\\' OR c.employer_id LIKE ? ESCAPE '\\' OR c.code LIKE ? ESCAPE '\\')))";args.push(...Array(6).fill('%'+q+'%'));}
 const results=await db().batch([
  db().prepare(`SELECT ${columns},(b.xml_key<>'') AS hasXml,(SELECT GROUP_CONCAT(c.name, ' · ') FROM sepe_contracts c WHERE c.batch_id=b.id) AS names FROM sepe_batches b WHERE ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT 20 OFFSET ?`).bind(...args,page*20),
  db().prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(b.count),0) AS contractCount FROM sepe_batches b WHERE ${where}`).bind(...args),
 ]);
 return json({batches:(results[0].results as (BatchRow&{names:string})[]).map(clean),...(results[1].results[0] as {total:number;contractCount:number}),page,pageSize:20});
});}

export function writeSepe(request:Request){return boundary(async()=>{
 const p=await payload(request);if(!['preview','register'].includes(String(p.action)))throw new SepeError('Operación no válida.');
 if(typeof p.filename!=='string'||p.filename.length>180||!p.filename.trim()||! /\.xml$/i.test(p.filename))throw new SepeError('Selecciona un archivo XML.');
 const filename=p.filename.trim().replace(/[\\/\r\n\u0000-\u001f"]/g,'_');
 if(typeof p.file!=='string'||p.file.length>1398104||p.file.length%4!==0||/[^A-Za-z0-9+/=]/.test(p.file))throw new SepeError('El archivo XML no es válido o supera 1 MB.',413);
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(p.file),c=>c.charCodeAt(0));}catch{throw new SepeError('El archivo XML no se ha transmitido correctamente. Vuelve a seleccionarlo.');}
 const parsed=parseContractXml(bytes),fingerprint=await sha(canonicalContracts(parsed.contracts));
 const profile=companyProfile();
 for(const c of parsed.contracts){
  if(c.employerId!==profile.nif)parsed.warnings.push(`Contrato ${c.line}: el NIF ${c.employerId} no coincide con ${profile.nif}, configurado para ${profile.shortName}.`);
  if(!c.ccc.endsWith(profile.ccc))parsed.warnings.push(`Contrato ${c.line}: la cuenta de cotización no coincide con ${profile.ccc}, configurada para la práctica.`);
 }
 parsed.warnings=[...new Set(parsed.warnings)];
 const keys=await Promise.all(parsed.contracts.map(c=>sha(contractIdentity(c)))),previous=await duplicates(keys);
 if(p.action==='preview')return json({...parsed,fingerprint,duplicates:previous});
 if(p.consent!==true)throw new SepeError('Confirma que has revisado los datos y que son ficticios.');
 if(p.fingerprint!==fingerprint)throw new SepeError('El archivo ha cambiado. Impórtalo de nuevo y revisa sus datos.',409);
 if(parsed.warnings.length&&p.warningsAccepted!==true)throw new SepeError('Revisa y acepta las observaciones antes de confirmar.');
 const id=uuid(p.id),date=sepeValidDate(p.communicationDate,'la fecha de comunicación'),existing=await stored(id);
 if(existing){if(existing.fingerprint===fingerprint&&existing.communicationDate===date)return json(await receipt(id));throw new SepeError('La referencia corresponde a otra comunicación. Vuelve a importar el fichero.',409,existing.id);}
 if(previous.length)throw new SepeError('El fichero contiene contratos que ya están registrados. Consulta el justificante y retíralos del fichero antes de presentar los demás.',409,previous[0].batchId);
 const now=new Date().toISOString(),reference='SIM-SEPE-'+date.slice(0,4)+'-'+id.replaceAll('-','').slice(0,12).toUpperCase(),xmlKey='';
 const rows=parsed.contracts.map((c,i)=>({line:c.line,identityKey:keys[i],name:c.name,personId:c.personId,employerId:c.employerId,code:c.code,data:JSON.stringify(c)}));
 try{
  await db().batch([
   db().prepare(`INSERT INTO sepe_batches (id,company_id,reference,filename,count,communication_date,created_at,warnings,fingerprint,xml_key) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM sepe_contracts WHERE company_id=?)+?<=5000`).bind(id,companyId(),reference,filename,rows.length,date,now,JSON.stringify(parsed.warnings),fingerprint,xmlKey,companyId(),rows.length),
   db().prepare(`INSERT INTO sepe_contracts (company_id,batch_id,line,identity_key,name,person_id,employer_id,code,data) SELECT ?,?,json_extract(value,'$.line'),json_extract(value,'$.identityKey'),json_extract(value,'$.name'),json_extract(value,'$.personId'),json_extract(value,'$.employerId'),json_extract(value,'$.code'),json_extract(value,'$.data') FROM json_each(?) WHERE EXISTS (SELECT 1 FROM sepe_batches WHERE id=? AND xml_key=?)`).bind(companyId(),id,JSON.stringify(rows),id,xmlKey),
  ]);
 }catch(e){
  const raced=await stored(id);
  if(raced){if(raced.fingerprint===fingerprint&&raced.communicationDate===date)return json(await receipt(id));throw new SepeError('Esta referencia ya está utilizada por otra comunicación.',409,raced.id);}
  const conflict=await duplicates(keys);if(conflict.length)throw new SepeError('Otro equipo acaba de registrar uno de estos contratos. Consulta su justificante.',409,conflict[0].batchId);throw e;
 }
 if(!await stored(id)){throw new SepeError('Se ha alcanzado el límite de 5.000 contratos de la simulación.',409);}
 return json(await receipt(id),201);
});}
