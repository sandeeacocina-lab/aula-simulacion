import {newMailId} from '@/lib/mail-types';
import {companyId,companyProfile} from './company-server';
import {env} from '@/lib/local/runtime';
type Scope='sepe'|'social'|'registry'|'bank'|'mail'|'mandate'|'documentation'|'document'|'verifactu'|'all';
class PracticeError extends Error{constructor(message:string,public status=400){super(message);}}
const json=(d:unknown,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
const db=()=>{if(!env.DB)throw new PracticeError('No se puede consultar la central.',503);return env.DB;};
const scopes:Scope[]=['sepe','social','registry','bank','mail','mandate','documentation','document','verifactu','all'];
const tableStamp=(table:string,expression='id')=>`(SELECT COALESCE(json_group_array(v),'[]') FROM (SELECT ${expression} AS v FROM ${table} WHERE ${table==='bank_accounts'?`id='${companyId()}'`:`company_id='${companyId()}'`} ORDER BY id))`;
function stampSQL(scope:Scope){
 const parts:Record<string,string[]>={verifactu:[tableStamp('vf_invoices',"id||revision"),tableStamp('vf_records',"id||hash")],sepe:[tableStamp('sepe_batches',"id||created_at||fingerprint")],social:[tableStamp('social_batches',"id||created_at||fingerprint")],registry:[tableStamp('social_registry',"id||created_at||fingerprint")],bank:[tableStamp('bank_accounts',"id||created_at||revision"),tableStamp('bank_batches',"id||created_at||fingerprint"),tableStamp('bank_products'),tableStamp('bank_mandates',"id||revision")],mail:[tableStamp('mail_messages',"id||revision")],documentation:[tableStamp('documentation_assignments',"id||revision"),tableStamp('documentation_files',"id||revision")]};
 return 'SELECT '+(scope==='all'?Object.values(parts).flat():parts[scope==='mandate'?'bank':scope==='document'?'documentation':scope]).join("||'|'||")+' AS stamp';
}
async function sha(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');}
const idsWhere=()=>`company_id='${companyId()}' AND id IN (SELECT value FROM json_each(?))`;
async function rows(table:string,id?:string){return (await db().prepare(`SELECT * FROM ${table} WHERE ${table==='bank_accounts'?`id='${companyId()}'`:`company_id='${companyId()}'`}${id?' AND id=?':''} ORDER BY id`).bind(...(id?[id]:[])).all<Record<string,any>>()).results;}
async function plan(scope:Scope,id?:string){
 const statements:D1PreparedStatement[]=[],files:string[]=[],counts:Record<string,number>={},notes:string[]=[];
 const has=(s:Scope)=>scope===s||scope==='all';
 const remove=(table:string,ids:string[])=>statements.push(db().prepare(`DELETE FROM ${table} WHERE ${idsWhere()}`).bind(JSON.stringify(ids)));
 if(has('verifactu')){if(id)throw new PracticeError('Reinicia el módulo completo para conservar la coherencia del historial.');const invoices=await rows('vf_invoices');counts['Facturas y borradores']=invoices.length;counts['Registros VERI*FACTU']=(await rows('vf_records')).length;files.push(...invoices.map(x=>x.source_key).filter(Boolean));statements.push(db().prepare("DELETE FROM vf_records WHERE company_id='demo'"),db().prepare("DELETE FROM vf_invoices WHERE company_id='demo'"));}
 if(has('sepe')){const r=await rows('sepe_batches',id),ids=r.map(x=>x.id);counts['Comunicaciones SEPE']=r.length;files.push(...r.map(x=>x.xml_key).filter(Boolean));statements.push(db().prepare(`DELETE FROM sepe_contracts WHERE company_id='${companyId()}' AND batch_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)));remove('sepe_batches',ids);}
 const socialRows=has('social')?await rows('social_batches',id):[];
 if(has('social')){const r=socialRows,ids=r.map(x=>x.id);counts['Presentaciones de cotización']=r.length;const docs=await db().prepare(`SELECT pdf_key FROM social_documents WHERE company_id='${companyId()}' AND batch_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{pdf_key:string}>();files.push(...docs.results.map(x=>x.pdf_key));statements.push(db().prepare(`DELETE FROM social_documents WHERE company_id='${companyId()}' AND batch_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)));remove('social_batches',ids);}
 if(has('registry')){let r=await rows('social_registry',id);if(id&&r.length){const related=await db().prepare(`SELECT * FROM social_registry WHERE company_id='${companyId()}' AND kind='employment' AND (json_extract(data,'$.companyId')=? OR json_extract(data,'$.personId')=?)`).bind(id,id).all<Record<string,any>>();if(related.results.length){notes.push('También se borrarán las altas laborales vinculadas a esta empresa o persona.');r=[...r,...related.results];}}counts['Inscripciones, afiliaciones y altas']=r.length;remove('social_registry',r.map(x=>x.id));}
 if(has('mail')){const r=await rows('mail_messages',id);counts['Mensajes de correo']=r.length;for(const m of r)for(const a of JSON.parse(m.attachments))if(a.key)files.push(a.key);remove('mail_messages',r.map(x=>x.id));}
 if(has('documentation')){
  const assignments=await rows('documentation_assignments',id),ids=assignments.map(row=>row.id);
  const documents=(await db().prepare('SELECT * FROM documentation_files WHERE assignment_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{id:string;file_key:string}>()).results;
  counts['Encargos']=assignments.length;counts['Documentos de encargos']=documents.length;
  files.push(...documents.map(row=>row.file_key));remove('documentation_files',documents.map(row=>row.id));remove('documentation_assignments',ids);
 }
 if(scope==='document'){
  const documents=await rows('documentation_files',id);counts['Documentos']=documents.length;files.push(...documents.map(row=>row.file_key));
  statements.push(db().prepare('UPDATE documentation_assignments SET revision=revision+1 WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(documents.map(row=>row.assignment_id))));
  remove('documentation_files',documents.map(row=>row.id));
 }
 if(scope==='mandate'){const r=await rows('bank_mandates',id);counts['Domiciliaciones']=r.length;remove('bank_mandates',r.map(x=>x.id));notes.push('Los cargos o cobros ya contabilizados se conservarán.');}
 if(has('bank')){
  const allBatches=await rows('bank_batches'),allProducts=await rows('bank_products');let target=allBatches.filter(x=>!id||x.id===id);let products=allProducts.filter(x=>!id||x.id===id);
  if(id&&target.some(x=>x.kind==='opening'))throw new PracticeError('Para borrar el saldo inicial, reinicia la banca completa.');
  if(products.length&&id){const payments=await db().prepare('SELECT batch_id FROM bank_product_payments WHERE product_id=?').bind(id).all<{batch_id:string}>();target=allBatches.filter(b=>b.id===id||payments.results.some(p=>p.batch_id===b.id));notes.push('También se eliminarán las cuotas contabilizadas de esta financiación.');}
  const ids=target.map(x=>x.id),encoded=JSON.stringify(ids);counts['Operaciones bancarias']=target.length;counts['Contratos de financiación']=products.length;files.push(...target.map(x=>x.xml_key).filter(Boolean));
  statements.push(db().prepare('DELETE FROM bank_product_payments WHERE batch_id IN (SELECT value FROM json_each(?)) OR product_id IN (SELECT value FROM json_each(?))').bind(encoded,JSON.stringify(products.map(x=>x.id))));
  statements.push(db().prepare(`DELETE FROM bank_movements WHERE company_id='${companyId()}' AND batch_id IN (SELECT value FROM json_each(?))`).bind(encoded));remove('bank_batches',ids);remove('bank_products',products.map(x=>x.id));
  if(has('bank')&&!id){counts['Domiciliaciones']=(await rows('bank_mandates')).length;statements.push(db().prepare(`DELETE FROM bank_mandates WHERE company_id='${companyId()}'`),db().prepare('INSERT INTO bank_preferences(id,iban) SELECT id,iban FROM bank_accounts WHERE id=? ON CONFLICT(id) DO UPDATE SET iban=excluded.iban').bind(companyId()),db().prepare(`DELETE FROM bank_accounts WHERE id='${companyId()}'`));notes.push('Se conservará el IBAN. Podrás abrir de nuevo la cuenta con el saldo inicial del siguiente encargo.');}
  else{
   const remaining=await db().prepare(`SELECT delta FROM bank_movements WHERE company_id='${companyId()}' AND batch_id NOT IN (SELECT value FROM json_each(?)) ORDER BY id`).bind(encoded).all<{delta:number}>();let balance=0;for(const m of remaining.results){balance+=m.delta;if(balance<0||balance>1e12)throw new PracticeError('No se puede borrar este ingreso: dejaría pagos posteriores sin saldo. Borra primero esos pagos o reinicia la banca.');}
   notes.push('Se recalcularán el saldo y los saldos de las operaciones posteriores.');
   statements.push(db().prepare(`WITH balances AS (SELECT id,SUM(delta) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING) AS amount FROM bank_movements WHERE company_id='${companyId()}') UPDATE bank_movements SET balance=(SELECT amount FROM balances WHERE balances.id=bank_movements.id) WHERE company_id='${companyId()}'`));
   statements.push(db().prepare(`UPDATE bank_batches SET before=(SELECT balance-delta FROM bank_movements WHERE batch_id=bank_batches.id ORDER BY id LIMIT 1),after=(SELECT balance FROM bank_movements WHERE batch_id=bank_batches.id ORDER BY id DESC LIMIT 1) WHERE company_id='${companyId()}'`));
   statements.push(db().prepare(`UPDATE bank_accounts SET balance=?,revision=revision+1 WHERE id='${companyId()}'`).bind(balance));
  }
 }
 if(id&&!Object.values(counts).some(Boolean))throw new PracticeError('El registro ya no existe. Actualiza la consulta.',404);
 return {statements,files,counts,notes};
}
async function cleanup(){if(!env.BUCKET)return;for(let i=0;i<100;i++){const r=await db().prepare('SELECT key FROM practice_files LIMIT 100').all<{key:string}>();if(!r.results.length)break;const keys=r.results.map(x=>x.key);try{await env.BUCKET.delete(keys);await db().prepare('DELETE FROM practice_files WHERE key IN (SELECT value FROM json_each(?))').bind(JSON.stringify(keys)).run();}catch{break;}}}
export async function managePractice(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new PracticeError('Abre la gestión desde la central.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new PracticeError('Formato no admitido.',415);
 const reader=request.body?.getReader();if(!reader)throw new PracticeError('Faltan los datos.');const chunks:Uint8Array[]=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4000){await reader.cancel();throw new PracticeError('Solicitud demasiado grande.',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let p:any;try{p=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PracticeError('Solicitud no válida.');}
 if(!p||!scopes.includes(p.scope)||!['preview','delete'].includes(p.action))throw new PracticeError('Operación no válida.');
 const id=p.id===undefined?undefined:String(p.id);if(id&&!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id))throw new PracticeError('Referencia no válida.');if(id&&p.scope==='all')throw new PracticeError('Ámbito no válido.');
 const sql=stampSQL(p.scope),before=await db().prepare(sql).first<{stamp:string}>(),prepared=await plan(p.scope,id),after=await db().prepare(sql).first<{stamp:string}>();if(before?.stamp!==after?.stamp)throw new PracticeError('Los datos han cambiado. Abre de nuevo la confirmación.',409);
 const token=await sha(JSON.stringify({company:companyId(),scope:p.scope,id,stamp:before?.stamp}));
 if(p.action==='preview')return json({token,counts:prepared.counts,notes:prepared.notes});
 if(p.confirm!=='BORRAR'||p.token!==token)throw new PracticeError('Los datos han cambiado o falta confirmar el borrado. Abre de nuevo la confirmación.',409);
 const guard=newMailId();try{await db().batch([
  db().prepare(`INSERT INTO practice_guards(id,valid) SELECT ?,CASE WHEN (${sql})=? THEN 1 ELSE 0 END`).bind(guard,before!.stamp),
  db().prepare("INSERT OR IGNORE INTO practice_files(key) SELECT value FROM json_each(?)").bind(JSON.stringify(prepared.files)),...prepared.statements,db().prepare('DELETE FROM practice_guards WHERE id=?').bind(guard),
 ]);}catch(e){if(String(e).includes('practice_guard_valid'))throw new PracticeError('Otro equipo ha cambiado los datos. Revisa el borrado de nuevo.',409);throw e;}
 await cleanup();return json({deleted:prepared.counts});
 }catch(e){if(e instanceof PracticeError)return json({error:e.message},e.status);console.error('Practice deletion failed',String(e));return json({error:'No se ha podido completar el borrado. Actualiza y vuelve a intentarlo.'},503);}}
