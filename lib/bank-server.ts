import {companyId,companyProfile} from './company-server';
import {env} from '@/lib/local/runtime';
import {BankError,cents,normalizeIban,parseBankXml,validDate} from './bank-xml';
import type {BankAccount,BankBatch,BankItem,BankMovement,BankParsed} from './bank-types';
const accountFields='id,name,iban,balance,revision,created_at AS createdAt';
const batchFields='id,kind,filename,message_id AS messageId,format,count,total,delta,before,after,booking_date AS bookingDate,created_at AS createdAt,warnings,xml_key AS xmlKey,fingerprint,message_key AS messageKey';
const movementFields='id,batch_id AS batchId,line,name,iban,amount,delta,balance,concept,reference,kind,requested_date AS requestedDate,booking_date AS bookingDate,created_at AS createdAt,mandate_id AS mandateId,mandate_date AS mandateDate,source_name AS sourceName,source_iban AS sourceIban';
type BatchRow=Omit<BankBatch,'warnings'|'hasXml'>&{warnings:string;xmlKey:string;fingerprint:string;messageKey:string};
function db(){if(!env.DB)throw new BankError('La banca no está disponible temporalmente. Vuelve a intentarlo.',503);return env.DB;}
function bucket(){if(!env.BUCKET)throw new BankError('No se puede conservar el fichero en este momento. Vuelve a intentarlo.',503);return env.BUCKET;}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cleanBatch=({xmlKey,warnings,fingerprint,messageKey,...b}:BatchRow):BankBatch=>({...b,warnings:JSON.parse(warnings),hasXml:!!xmlKey});
const uuid=(v:unknown)=>{if(typeof v!=='string'||! /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v))throw new BankError('Referencia de operación no válida.');return v;};
function text(v:unknown,label:string,max=240,optional=false){if(v===undefined&&optional)return '';if(typeof v!=='string'||v.length>max||(!optional&&!v.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new BankError('Revisa '+label+'.');return v.trim();}
async function sha(value:string){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('');}
async function account(){return db().prepare(`SELECT ${accountFields} FROM bank_accounts WHERE id=?`).bind(companyId()).first<BankAccount>();}
async function batch(id:string){return db().prepare(`SELECT ${batchFields} FROM bank_batches WHERE company_id=? AND id=?`).bind(companyId(),id).first<BatchRow>();}
async function duplicate(fingerprint:string,messageKey:string){return db().prepare(`SELECT ${batchFields} FROM bank_batches WHERE company_id=? AND (fingerprint=? OR message_key=?) LIMIT 1`).bind(companyId(),fingerprint,messageKey).first<BatchRow>();}
async function boundary(run:()=>Promise<Response>){try{return await run();}catch(e){if(e instanceof BankError)return json({error:e.message,...(e.batchId?{batchId:e.batchId}:{})},e.status);console.error('Bank operation failed',e instanceof Error?e.message:'Unknown error');return json({error:'No se ha podido completar la operación. Conserva el archivo y vuelve a intentarlo.'},503);}}
async function payload(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new BankError('Abre la banca desde la central de servicios.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new BankError('Formato de envío no admitido.',415);
 const max=1200000;if(Number(request.headers.get('content-length')||0)>max)throw new BankError('El XML no puede superar 1 MB.',413);
 const reader=request.body?.getReader();if(!reader)throw new BankError('Faltan los datos de la operación.');
 const chunks:Uint8Array[]=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new BankError('El XML no puede superar 1 MB.',413);}chunks.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
 try{const p=JSON.parse(new TextDecoder().decode(buffer));if(!p||typeof p!=='object'||Array.isArray(p))throw 0;return p as Record<string,unknown>;}catch{throw new BankError('No se ha podido leer la operación.');}
}
function accountWarnings(parsed:BankParsed,a:BankAccount){
 const warnings=new Set(parsed.warnings);
 if(parsed.items.some(i=>!i.sourceName.toLocaleUpperCase('es').includes(`${companyProfile().shortName}`)))warnings.add(`El titular del XML no coincide con ${companyProfile().name}. Al confirmar, registrarás esta remesa en la cuenta de ${companyProfile().shortName}.`);
 if(a.iban&&parsed.items.some(i=>i.sourceIban!==a.iban))warnings.add(`La cuenta del XML no coincide con el IBAN de prácticas de ${companyProfile().shortName}. Comprueba la cuenta antes de confirmar.`);
 return {...parsed,warnings:[...warnings]};
}
async function keys(parsed:BankParsed){
 // Whitespace, filename and XML formatting cannot bypass duplicate detection.
 const fingerprint=await sha(JSON.stringify({messageId:parsed.messageId,items:parsed.items,kind:parsed.kind}));
 const messageKey=await sha(JSON.stringify({messageId:parsed.messageId,accounts:[...new Set(parsed.items.map(i=>i.sourceIban))].sort(),direction:parsed.kind==='collection'?'in':'out'}));
 return {fingerprint,messageKey};
}
function itemInsert(id:string,items:BankItem[],before:number,positive:boolean,bookingDate:string,createdAt:string,fingerprint:string){
 let balance=before;const rows=items.map((item,i)=>{const delta=item.amount*(positive?1:-1);balance+=delta;return {...item,line:i+1,delta,balance};});
 return db().prepare(`INSERT INTO bank_movements (company_id,batch_id,line,name,iban,amount,delta,balance,concept,reference,kind,requested_date,booking_date,created_at,mandate_id,mandate_date,source_name,source_iban)
 SELECT ?,?,json_extract(value,'$.line'),json_extract(value,'$.name'),json_extract(value,'$.iban'),json_extract(value,'$.amount'),json_extract(value,'$.delta'),json_extract(value,'$.balance'),json_extract(value,'$.concept'),json_extract(value,'$.reference'),json_extract(value,'$.kind'),json_extract(value,'$.requestedDate'),?,?,json_extract(value,'$.mandateId'),json_extract(value,'$.mandateDate'),json_extract(value,'$.sourceName'),json_extract(value,'$.sourceIban') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM bank_batches WHERE id=? AND company_id=? AND fingerprint=? AND created_at=?) ON CONFLICT(batch_id,line) DO NOTHING`).bind(companyId(),id,bookingDate,createdAt,JSON.stringify(rows),id,companyId(),fingerprint,createdAt);
}
function batchInsert(b:BankBatch,hash:string,key:string,xmlKey:string,revision:number){
 return db().prepare(`INSERT INTO bank_batches (id,company_id,kind,fingerprint,message_key,filename,message_id,format,count,total,delta,before,after,booking_date,created_at,warnings,xml_key)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM bank_accounts WHERE id=? AND revision=? AND balance=? AND balance+?>=0 AND balance+?<=1000000000000`)
 .bind(b.id,companyId(),b.kind,hash,key,b.filename,b.messageId,b.format,b.count,b.total,b.delta,b.before,b.after,b.bookingDate,b.createdAt,JSON.stringify(b.warnings),xmlKey,companyId(),revision,b.before,b.delta,b.delta);
}
async function details(id:string){const row=await batch(id);if(!row)throw new BankError('No se encuentra la remesa.',404);const items=await db().prepare(`SELECT ${movementFields} FROM bank_movements WHERE batch_id=? ORDER BY line`).bind(id).all<BankMovement>();return {batch:cleanBatch(row),items:items.results};}
function filter(url:URL){
 const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'',q=(url.searchParams.get('q')||'').trim().slice(0,120).replace(/[\\%_]/g,'\\$&');
 if(from)validDate(from);if(to)validDate(to);if(from&&to&&from>to)throw new BankError('La fecha de inicio debe ser anterior a la fecha final.');
 let where='company_id=?';const args:string[]=[companyId()];
 if(from){where+=' AND booking_date>=?';args.push(from);}if(to){where+=' AND booking_date<=?';args.push(to);}
 if(q){where+=" AND (name LIKE ? ESCAPE '\\' OR concept LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')";args.push(...Array(3).fill('%'+q+'%'));}
 return {where,args};
}
export function readBank(request:Request){return boundary(async()=>{
 const url=new URL(request.url);
 if(url.searchParams.has('batch')){
  const id=uuid(url.searchParams.get('batch'));if(url.searchParams.get('xml')==='1'){
   const b=await batch(id);if(!b?.xmlKey)throw new BankError('Este movimiento no tiene fichero XML.',404);
   const file=await bucket().get(b.xmlKey);if(!file)throw new BankError('El XML no está disponible temporalmente.',503);
   const encoded=encodeURIComponent(b.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="remesa.xml"; filename*=UTF-8''${encoded}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }return json(await details(id));
 }
 const {where,args}=filter(url);
 if(url.searchParams.get('export')==='csv'){
  const rows=await db().prepare(`SELECT ${movementFields} FROM bank_movements WHERE ${where} ORDER BY id DESC LIMIT 10000`).bind(...args).all<BankMovement>();
  const cell=(v:unknown)=>'"'+String(v).replace(/^\s*[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const table=[['Registro','Fecha','Concepto','Empresa o persona','Referencia','IBAN','Entrada EUR','Salida EUR','Saldo EUR'],...rows.results.map(r=>[r.id,r.bookingDate,r.concept,r.name,r.reference,r.iban,r.delta>0?(r.delta/100).toFixed(2).replace('.',','):'',r.delta<0?(-r.delta/100).toFixed(2).replace('.',','):'',(r.balance/100).toFixed(2).replace('.',',')])];
  return new Response('\uFEFF'+table.map(row=>row.map(cell).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="extracto-${companyId()}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>10000)throw new BankError('Página no válida.');
 const view=url.searchParams.get('view')||'full';if(!['full','account','history','summary'].includes(view))throw new BankError('Vista de cuenta no válida.');
 const showMovements=view==='full'||view==='account',showBatches=view==='full'||view==='history';
 const result=await db().batch([
  db().prepare(`SELECT ${accountFields} FROM bank_accounts WHERE id=?`).bind(companyId()),
  showMovements?db().prepare(`SELECT ${movementFields} FROM bank_movements WHERE ${where} ORDER BY id DESC LIMIT 30 OFFSET ?`).bind(...args,page*30):db().prepare('SELECT 1 WHERE 0'),
  db().prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) AS credits,COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) AS debits FROM bank_movements WHERE ${where}`).bind(...args),
  showBatches?db().prepare(`SELECT ${batchFields} FROM bank_batches WHERE company_id=? ORDER BY created_at DESC,id DESC LIMIT 20`).bind(companyId()):db().prepare('SELECT 1 WHERE 0'),
 ]);
 const saved=result[0].results[0]?null:await db().prepare('SELECT iban FROM bank_preferences WHERE id=?').bind(companyId()).first<{iban:string}>();
 return json({preferredIban:saved?.iban??companyProfile().iban,account:result[0].results[0]||null,movements:result[1].results,batches:(result[3].results as BatchRow[]).map(cleanBatch),...(result[2].results[0] as {total:number;credits:number;debits:number}),page,pageSize:30});
});}
export function writeBank(request:Request){return boundary(async()=>{
 const p=await payload(request),action=p.action;
 if(!['preview','execute','setup','funds','account-iban'].includes(String(action)))throw new BankError('Operación no válida.');
 if(action!=='preview'&&p.consent!==true)throw new BankError('Confirma que los datos son ficticios y que has revisado la operación.');
 const a=await account();
 if(action==='account-iban'){
  if(!a)throw new BankError('La cuenta no está abierta.',409);
  const iban=normalizeIban(text(p.iban,'el IBAN',40));if(!/^ES\d{22}$/.test(iban))throw new BankError('Indique un IBAN español: ES y 22 cifras.');
  const result=await db().prepare('UPDATE bank_accounts SET iban=?,revision=revision+1 WHERE id=? AND revision=? AND created_at=?').bind(iban,companyId(),p.revision,p.accountCreatedAt).run();
  if(!result.meta.changes)throw new BankError('La cuenta ha cambiado. Abra de nuevo la configuración.',409);
  return json({account:await account()});
 }
 if(action==='setup'){
  const id=uuid(p.id);if(a){const existing=await batch(id);if(existing?.kind==='opening'&&existing.total===cents(p.amount,'el saldo inicial',true)&&existing.bookingDate===p.bookingDate&&a.iban===normalizeIban(text(p.iban,'el IBAN',34,true)))return json(await details(id));throw new BankError('La cuenta ya está creada. Actualiza la página.',409);}
  const balance=cents(p.amount,'el saldo inicial',true),iban=normalizeIban(text(p.iban,'el IBAN',34,true)),date=validDate(p.bookingDate),now=new Date().toISOString();
  if(iban&&!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))throw new BankError('El IBAN de prácticas debe tener formato de IBAN o quedar vacío.');
  const item:BankItem={name:`${companyProfile().name}`,iban,amount:balance,concept:'Saldo inicial de la cuenta',reference:id,requestedDate:date,kind:'opening',mandateId:'',mandateDate:'',sourceName:`${companyProfile().name}`,sourceIban:iban};
  const b:BankBatch={id,kind:'opening',filename:'',messageId:id,format:'',count:1,total:balance,delta:balance,before:0,after:balance,bookingDate:date,createdAt:now,warnings:[],hasXml:false};
  try{await db().batch([
   db().prepare('INSERT INTO bank_accounts (id,name,iban,balance,revision,created_at) VALUES (?,?,?,0,0,?)').bind(companyId(),`${companyProfile().name}`,iban,now),
   batchInsert(b,'manual:'+id,'manual:'+id,'',0),
   db().prepare('UPDATE bank_accounts SET balance=?,revision=1 WHERE id=?').bind(balance,companyId()),itemInsert(id,[item],0,true,date,now,'manual:'+id),
  ]);}catch(e){if(await account())throw new BankError('La cuenta ya se ha creado en otra pestaña. Actualiza la página.',409);throw e;}
  return json(await details(id),201);
 }
 if(!a)throw new BankError(`Abre primero la cuenta de ${companyProfile().shortName} para empezar a operar.`,409);
 let parsed:BankParsed,filename='',xml='',fingerprint:string,messageKey:string;
 if(action==='funds'){
  const id=uuid(p.id),amount=cents(p.amount),concept=text(p.concept,'el concepto',160),date=validDate(p.bookingDate);
  parsed={kind:'funds',format:'',messageId:id,initiator:`${companyProfile().name}`,count:1,total:amount,warnings:[],items:[{name:`${companyProfile().name}`,iban:a.iban,amount,concept,reference:id,requestedDate:date,kind:'funds',mandateId:'',mandateDate:'',sourceName:`${companyProfile().name}`,sourceIban:a.iban}]};
  fingerprint=await sha(JSON.stringify(parsed));messageKey='manual:'+id;
 }else{
  xml=text(p.xml,'el archivo XML',1100000);filename=text(p.filename,'el nombre del archivo',180).replace(/[\\/\r\n"]/g,'_');if(!/\.xml$/i.test(filename))throw new BankError('Selecciona un archivo XML.');
  parsed=accountWarnings(parseBankXml(xml),a);({fingerprint,messageKey}=await keys(parsed));
 }
 const previous=await duplicate(fingerprint,messageKey),positive=parsed.kind==='collection'||parsed.kind==='funds',delta=parsed.total*(positive?1:-1);
 if(action==='preview')return json({parsed,account:a,duplicateId:previous?.id||null,delta,after:a.balance+delta});
 const id=uuid(p.id),date=validDate(p.bookingDate);
 if(previous){if(previous.id===id&&previous.fingerprint===fingerprint&&previous.bookingDate===date)return json(await details(id));throw new BankError('Esta remesa ya está contabilizada. Abre el justificante para consultarla.',409,previous.id);}
 if(parsed.warnings.length&&p.warningsAccepted!==true)throw new BankError('Revisa y acepta las advertencias antes de confirmar.');
 if(!Number.isInteger(p.revision)||p.revision!==a.revision)throw new BankError(action==='funds'?'El saldo ha cambiado. Cierra esta ventana y vuelve a abrir el ingreso.':'El saldo ha cambiado en otra pestaña. Vuelve a revisar la operación antes de confirmar.',409);
 if(a.balance+delta<0)throw new BankError('Saldo insuficiente para ejecutar la remesa. Registra fondos o revisa los importes.',409);
 if(a.balance+delta>1_000_000_000_000)throw new BankError('Se ha alcanzado el límite de saldo de la simulación.',409);
 const count=await db().prepare('SELECT COUNT(*) AS n FROM bank_movements WHERE company_id=?').bind(companyId()).first<{n:number}>();if((count?.n||0)+parsed.count>10000)throw new BankError('Se ha alcanzado el límite de 10.000 movimientos de la cuenta.',409);
 const now=new Date().toISOString(),xmlKey='';
 const b:BankBatch={id,kind:parsed.kind,filename,messageId:parsed.messageId,format:parsed.format,count:parsed.count,total:parsed.total,delta,before:a.balance,after:a.balance+delta,bookingDate:date,createdAt:now,warnings:parsed.warnings,hasXml:!!xmlKey};
 try{
  const result=await db().batch([
   batchInsert(b,fingerprint,messageKey,xmlKey,a.revision),
   db().prepare('UPDATE bank_accounts SET balance=balance+?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM bank_batches WHERE id=? AND fingerprint=? AND created_at=?)').bind(delta,companyId(),a.revision,id,fingerprint,now),
   itemInsert(id,parsed.items,a.balance,positive,date,now,fingerprint),
  ]);
  if(!result[0].meta.changes){const existing=await batch(id);if(existing?.fingerprint===fingerprint){if(xmlKey&&existing.xmlKey!==xmlKey)await bucket().delete(xmlKey);return json(await details(id));}throw new BankError('El saldo ha cambiado en otra pestaña. Revisa de nuevo antes de confirmar.',409);}
 }catch(e){
  const existing=await batch(id);
  if(xmlKey&&existing?.xmlKey!==xmlKey){try{await bucket().delete(xmlKey);}catch{ /* Never delete the committed source file. */ }}
  if(existing?.fingerprint===fingerprint)return json(await details(id));
  if(existing)throw new BankError('La referencia ya pertenece a otra operación. Inicia un nuevo envío.',409,existing.id);
  const repeated=await duplicate(fingerprint,messageKey);if(repeated)throw new BankError('La remesa ya está registrada.',409,repeated.id);throw e;
 }
 return json(await details(id),201);
});}

// Shared ledger primitives for manual banking operations.
export {db as bankDb,json as bankJson,uuid as bankUuid,text as bankText,sha as bankSha,account as bankAccount,batch as bankBatch,details as bankDetails,boundary as bankBoundary,payload as bankPayload,batchInsert as bankBatchInsert};
