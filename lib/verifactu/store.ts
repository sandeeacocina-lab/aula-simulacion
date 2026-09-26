import type {Database} from 'sql.js';
import {linkRectification} from './import';
import {exclusive,readDatabase,persistDatabase,readStore,type StoredFile} from '../local/runtime';
import {getProfile,validateProfile} from '../local/profile';
import {selectedWorkspaceId} from '../local/storage';
import {uuid,validateShape,validateSignature,invoiceErrors,fullNumber,recordHash,digest,type Invoice,type SavedInvoice,type InvoiceRecord,type RecordPayload,type Scenario,type RecordKind,type RecordStatus,type PracticeSignature} from './model';
function query<T>(db:Database,sql:string,args:(string|number)[]=[]):T[]{const s=db.prepare(sql);try{s.bind(args);const rows:T[]=[];while(s.step())rows.push(s.getAsObject() as T);return rows;}finally{s.free();}}
function unpack(r:any):SavedInvoice{return {invoice:JSON.parse(r.data),state:r.state,revision:r.revision,sourceKey:r.source_key,createdAt:r.created_at};}
function unpackRecord(r:any):InvoiceRecord{return {seq:r.seq,id:r.id,invoiceId:r.invoice_id,kind:r.kind,previousHash:r.previous_hash,hash:r.hash,createdAt:r.created_at,status:r.status,message:r.message,payload:JSON.parse(r.payload)};}
async function access<T>(fn:(db:Database)=>T|Promise<T>,write=false,files?:Map<string,StoredFile>,id=selectedWorkspaceId()):Promise<T>{return exclusive(async()=>{const db=await readDatabase(id);try{const result=await fn(db);if(write)await persistDatabase(db.export(),{files},id);return result;}finally{db.close();}},id);}
export function listInvoices(id=selectedWorkspaceId()){return access(db=>query<any>(db,'SELECT * FROM vf_invoices ORDER BY created_at DESC,id').map(unpack),false,undefined,id);}
export function listRecords(id=selectedWorkspaceId()){return access(db=>query<any>(db,'SELECT * FROM vf_records ORDER BY seq').map(unpackRecord),false,undefined,id);}
function current(db:Database,id:string){const row=query<any>(db,'SELECT * FROM vf_invoices WHERE id=?',[id])[0];if(!row)throw Error('La factura ya no existe. Actualiza la consulta.');return unpack(row);}
function validInvoice(i:Invoice){validateShape(i);validateProfile(i.brand);if(i.issuer.nif.trim().toUpperCase()!==getProfile().nif.trim().toUpperCase())throw Error('El emisor no coincide con la empresa activa.');}
export function saveDraft(invoice:Invoice,revision=0){return access(db=>{validInvoice(invoice);const row=query<any>(db,'SELECT * FROM vf_invoices WHERE id=?',[invoice.id])[0];if(row&&(row.state!=='draft'||row.revision!==revision))throw Error('La factura se ha emitido o ha cambiado en otra pestaña. Vuelve a abrirla.');if(!row&&revision!==0)throw Error('El borrador ya no existe.');
 if(row)db.run('UPDATE vf_invoices SET data=?,revision=revision+1 WHERE id=?',[JSON.stringify(invoice),invoice.id]);else db.run("INSERT INTO vf_invoices (id,state,data,created_at) VALUES (?,'draft',?,?)",[invoice.id,JSON.stringify(invoice),new Date().toISOString()]);return current(db,invoice.id);},true);}
export function saveImported(invoices:Invoice[],bytes:Uint8Array,fingerprint:string){const key=`verifactu/demo/${fingerprint}.pdf`,files=new Map([[key,{bytes,type:'application/pdf'}]]);return access(db=>{if(query(db,'SELECT id FROM vf_invoices WHERE source_key=?',[key]).length)throw Error('Este PDF ya está en la práctica. Revisa los borradores o el historial antes de importarlo otra vez.');
 for(const invoice of invoices){validInvoice(invoice);db.run("INSERT INTO vf_invoices (id,state,data,source_key,created_at) VALUES (?,'draft',?,?,?)",[invoice.id,JSON.stringify(invoice),key,new Date().toISOString()]);}return invoices.length;},true,files);}
export function saveRectificationImport(invoice:Invoice,bytes:Uint8Array,fingerprint:string,originalId:string){
 const key=`verifactu/demo/${fingerprint}.pdf`,files=new Map([[key,{bytes,type:'application/pdf'}]]);
 return access(db=>{
  const original=current(db,originalId),last=query<any>(db,'SELECT kind FROM vf_records WHERE invoice_id=? ORDER BY seq DESC LIMIT 1',[originalId])[0];
  if(original.state!=='issued'||last?.kind==='anulacion')throw Error('Abre una factura emitida que no esté anulada para vincular su rectificativa.');
  validInvoice(invoice);linkRectification(invoice,original.invoice);
  const existing=query<any>(db,'SELECT * FROM vf_invoices WHERE source_key=?',[key]).map(unpack).find(r=>r.invoice.sourcePage===invoice.sourcePage);
  if(existing?.state==='issued')throw Error('Esta rectificativa ya está emitida. Consúltala en Facturas y registros.');
  const linked=linkRectification(existing?.invoice||invoice,original.invoice);
  if(existing)db.run('UPDATE vf_invoices SET data=?,revision=revision+1 WHERE id=?',[JSON.stringify(linked),linked.id]);
  else db.run("INSERT INTO vf_invoices (id,state,data,source_key,created_at) VALUES (?,'draft',?,?,?)",[linked.id,JSON.stringify(linked),key,new Date().toISOString()]);
  return current(db,linked.id);
 },true,files);
}
export function sourceFile(key:string,id=selectedWorkspaceId()){return readStore<StoredFile>('files',key,id);}
export function deleteDraft(id:string,revision:number){return access(db=>{const row=current(db,id);if(row.state!=='draft'||row.revision!==revision)throw Error('Solo se pueden eliminar borradores sin cambios.');db.run('DELETE FROM vf_invoices WHERE id=?',[id]);},true);}
function addRecord(db:Database,i:Invoice,kind:RecordKind,reason:string,scenario:Scenario,signature:PracticeSignature){
 const last=query<any>(db,'SELECT hash FROM vf_records ORDER BY seq DESC LIMIT 1')[0];const prevInvoice=query<any>(db,'SELECT * FROM vf_records WHERE invoice_id=? ORDER BY seq DESC LIMIT 1',[i.id])[0];
 const payload:RecordPayload={invoice:structuredClone(i),kind,reason,previousHash:last?.hash||'',createdAt:new Date().toISOString(),rejectedBefore:prevInvoice?.status==='Incorrecto',signature:structuredClone(signature)};
 const status:RecordStatus=scenario==='warning'?'AceptadoConErrores':scenario==='rejected'?'Incorrecto':'Correcto';
 const message=scenario==='warning'?'Incidencia didáctica: registro admitido con un dato de clasificación que debe subsanarse.':scenario==='rejected'?'Incidencia didáctica: se ha simulado un código de registro no admitido. La factura no consta aceptada.':'Registro aceptado en la central de simulación.';
 const id=uuid();db.run('INSERT INTO vf_records (id,invoice_id,kind,previous_hash,hash,created_at,status,message,payload) VALUES (?,?,?,?,?,?,?,?,?)',[id,i.id,kind,payload.previousHash,recordHash(payload),payload.createdAt,status,message,JSON.stringify(payload)]);
 return unpackRecord(query<any>(db,'SELECT * FROM vf_records WHERE id=?',[id])[0]);
}
export function issueInvoice(id:string,revision:number,scenario:Scenario,signature:PracticeSignature){return access(db=>{if(!['normal','warning','rejected'].includes(scenario))throw Error('Escenario no válido.');const row=current(db,id),i=row.invoice;if(row.state!=='draft'||row.revision!==revision)throw Error('La factura se ha emitido o ha cambiado. Actualiza la consulta.');validInvoice(i);validateSignature(signature,i);const errors=invoiceErrors(i);if(errors.length)throw Error(errors.join('\n'));
 const others=query<any>(db,"SELECT data FROM vf_invoices WHERE state='issued'").map(r=>JSON.parse(r.data) as Invoice);
 if(others.some(o=>o.issuer.nif.toUpperCase()===i.issuer.nif.toUpperCase()&&o.date.slice(0,4)===i.date.slice(0,4)&&o.series.toUpperCase()===i.series.toUpperCase()&&Number(o.number)===Number(i.number)))throw Error('Ya existe una factura emitida con esa serie y número en el ejercicio.');
 db.run("UPDATE vf_invoices SET state='issued',revision=revision+1 WHERE id=?",[id]);return addRecord(db,i,'alta','',scenario,signature);},true);}
export function remedyInvoice(id:string,kind:'subsanacion'|'anulacion',reason:string,expectedLastId:string,signature:PracticeSignature){return access(db=>{if(!['subsanacion','anulacion'].includes(kind)||!reason.trim()||reason.length>2000)throw Error('Explica el motivo de la actuación.');const row=current(db,id),last=query<any>(db,'SELECT * FROM vf_records WHERE invoice_id=? ORDER BY seq DESC LIMIT 1',[id])[0];if(row.state!=='issued'||!last||last.id!==expectedLastId)throw Error('El registro ha cambiado. Actualiza la consulta.');if(last.kind==='anulacion')throw Error('La factura ya tiene un registro de anulación.');if(kind==='subsanacion'&&last.status==='Correcto')throw Error('Esta factura no tiene una incidencia de registro pendiente. Para modificar importes, crea una rectificativa.');validateSignature(signature,row.invoice);return addRecord(db,row.invoice,kind,reason,'normal',signature);},true);}
export function checkChain(records:InvoiceRecord[]){let previous='';for(const r of records){if(r.previousHash!==previous||r.payload.previousHash!==previous||r.hash!==recordHash(r.payload)||r.invoiceId!==r.payload.invoice.id||r.kind!==r.payload.kind||r.createdAt!==r.payload.createdAt)return false;if(r.payload.signature){try{validateSignature(r.payload.signature,r.payload.invoice);}catch{return false;}}previous=r.hash;}return true;}
export function validateVfBackup(db:Database){
 const invoices=query<any>(db,'SELECT * FROM vf_invoices').map(unpack),records=query<any>(db,'SELECT * FROM vf_records ORDER BY seq').map(unpackRecord);
 for(const row of invoices){validateShape(row.invoice);validateProfile(row.invoice.brand);if(row.invoice.id!==query<any>(db,'SELECT id FROM vf_invoices WHERE data=?',[JSON.stringify(row.invoice)])[0]?.id)throw Error('Identificador de factura no válido en la copia.');const own=records.filter(r=>r.invoiceId===row.invoice.id);if(row.state==='issued'&&(!own.length||own[0].kind!=='alta')||row.state==='draft'&&own.length)throw Error('El historial de facturación de la copia no coincide.');for(const r of own)if(JSON.stringify(r.payload.invoice)!==JSON.stringify(row.invoice))throw Error('La factura emitida no coincide con su historial.');}
 if(!checkChain(records))throw Error('La cadena de registros VERI*FACTU de la copia no es íntegra.');
}
export type QrData={id:string;nif:string;number:string;date:string;total:string};
export function qrUrl(i:Invoice,base:string){const url=new URL(base);url.search='';const p=new URLSearchParams({cotejo:i.id,nif:i.issuer.nif,numero:fullNumber(i),fecha:i.date,total:String((i.taxes.reduce((s,t)=>s+t.gross-t.discount+t.quota,0)).toFixed(2))});url.hash='/servicios/agencia-tributaria/verifactu?'+p;return url.href;}
