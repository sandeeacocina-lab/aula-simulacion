import {newMailId} from '@/lib/mail-types';
import {companyId,companyProfile} from './company-server';
import {env} from '@/lib/local/runtime';
import {contributionSummary} from './social-receipt-data';
import {socialPdfResponse} from './social-receipt-pdf';
import {canonicalSocial,compareSocialDocuments,extractSocialPdf,liquidationIdentity,liquidationSignature,socialIdentity,socialValidDate} from './social-pdf';
import {SocialError,type SocialBatch,type SocialDocument,type SocialDuplicate} from './social-types';
const cols='b.id,b.reference,b.company,b.ccc,b.period_from AS periodFrom,b.period_to AS periodTo,b.kinds,b.workers,b.total,b.submission_date AS submissionDate,b.created_at AS createdAt,b.warnings';
type Row=Omit<SocialBatch,'warnings'>&{warnings:string};
const clean=(r:Row):SocialBatch=>({...r,warnings:JSON.parse(r.warnings)});
const json=(d:unknown,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function db(){if(!env.DB)throw new SocialError('El servicio no está disponible temporalmente.',503);return env.DB;}
function bucket(){if(!env.BUCKET)throw new SocialError('No se puede conservar el documento en este momento.',503);return env.BUCKET;}
function uuid(v:unknown){if(typeof v!=='string'||! /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v))throw new SocialError('La referencia de presentación no es válida.');return v;}
async function sha(v:string|Uint8Array){const data=typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');}
async function boundary(run:()=>Promise<Response>){try{return await run();}catch(e){if(e instanceof SocialError)return json({error:e.message,...(e.batchId?{batchId:e.batchId}:{})},e.status);console.error('Contribution operation failed',e instanceof Error?e.message:'Unknown error');return json({error:'No se ha podido completar el trámite. Conserve los PDF y vuelva a intentarlo.'},503);}}
async function payload(req:Request){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new SocialError('Abra el trámite desde la central.',403);
 if(!req.headers.get('content-type')?.includes('application/json'))throw new SocialError('Formato no admitido.',415);
 const max=14_050_000;if(Number(req.headers.get('content-length')||0)>max)throw new SocialError('Los PDF no pueden superar 10 MB en conjunto.',413);
 const reader=req.body?.getReader();if(!reader)throw new SocialError('Faltan los documentos.');let size=0;const parts:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new SocialError('Los PDF no pueden superar 10 MB en conjunto.',413);}parts.push(value);}
 const buffer=new Uint8Array(size);let at=0;for(const p of parts){buffer.set(p,at);at+=p.length;}
 try{const p=JSON.parse(new TextDecoder().decode(buffer));if(!p||typeof p!=='object'||Array.isArray(p))throw 0;return p as Record<string,unknown>;}catch{throw new SocialError('No se han podido leer los datos del envío.');}
}
const stored=(id:string)=>db().prepare(`SELECT ${cols},b.fingerprint,b.upload_key AS uploadKey FROM social_batches b WHERE b.company_id=? AND b.id=?`).bind(companyId(),id).first<Row&{fingerprint:string;uploadKey:string}>();
async function receipt(id:string){const b=await stored(id);if(!b)throw new SocialError('No se encuentra la presentación.',404);const docs=await db().prepare('SELECT data FROM social_documents WHERE company_id=? AND batch_id=? ORDER BY kind DESC').bind(companyId(),id).all<{data:string}>();const {fingerprint,uploadKey,...row}=b;return {batch:clean(row),documents:docs.results.map(d=>JSON.parse(d.data) as SocialDocument)};}
async function duplicates(keys:string[]){return (await db().prepare('SELECT d.batch_id AS batchId,b.reference,d.kind,json_extract(d.data,\'$.filename\') AS filename FROM social_documents d JOIN social_batches b ON b.id=d.batch_id WHERE d.company_id=? AND d.identity_key IN (SELECT value FROM json_each(?))').bind(companyId(),JSON.stringify(keys)).all<SocialDuplicate>()).results;}
export function readSocial(req:Request){return boundary(async()=>{
 const url=new URL(req.url),id=url.searchParams.get('batch');
 if(id){uuid(id);const kind=url.searchParams.get('pdf');if(kind){if(!['RNT','RLC'].includes(kind))throw new SocialError('Tipo de documento no válido.');const row=await db().prepare('SELECT pdf_key AS pdfKey,data FROM social_documents WHERE company_id=? AND batch_id=? AND kind=?').bind(companyId(),id,kind).first<{pdfKey:string;data:string}>();if(!row)throw new SocialError('No se encuentra el PDF.',404);const object=await bucket().get(row.pdfKey);if(!object)throw new SocialError('El PDF no está disponible temporalmente.',503);const doc=JSON.parse(row.data) as SocialDocument,name=encodeURIComponent(doc.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${kind}.pdf"; filename*=UTF-8''${name}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}if(url.searchParams.get('receipt')==='pdf')return socialPdfResponse(contributionSummary(await receipt(id)));return json(await receipt(id));}
 const page=Number(url.searchParams.get('page')||0),q=(url.searchParams.get('q')||'').trim().slice(0,100).replace(/[\\%_]/g,'\\$&'),period=url.searchParams.get('period')||'';
 if(!Number.isInteger(page)||page<0||page>10000)throw new SocialError('Página no válida.');if(period)socialValidDate(period+'-01');
 let where='b.company_id=?';const args:(string|number)[]=[companyId()];if(period){where+=' AND b.period_from<=? AND b.period_to>=?';args.push(period,period);}if(q){where+=" AND (b.reference LIKE ? ESCAPE '\\' OR b.company LIKE ? ESCAPE '\\' OR b.ccc LIKE ? ESCAPE '\\' OR b.kinds LIKE ? ESCAPE '\\')";args.push(...Array(4).fill('%'+q+'%'));}
 const rows=await db().batch([db().prepare(`SELECT ${cols} FROM social_batches b WHERE ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT 20 OFFSET ?`).bind(...args,page*20),db().prepare(`SELECT COUNT(*) AS total FROM social_batches b WHERE ${where}`).bind(...args)]);
 const batches=rows[0].results as Row[];
 return json({batches:batches.map(clean),total:(rows[1].results[0] as {total:number}).total,page,pageSize:20});
});}
export function writeSocial(req:Request){return boundary(async()=>{
 const p=await payload(req);if(!['preview','register'].includes(String(p.action))||!Array.isArray(p.files)||p.files.length<1||p.files.length>2)throw new SocialError('Seleccione una RNT, una liquidación o un documento de cada tipo.');
 const allFiles:{bytes:Uint8Array;doc:SocialDocument;hash:string}[]=[];
 for(const item of p.files){if(!item||typeof item!=='object'||typeof item.filename!=='string'||item.filename.length>180||! /\.pdf$/i.test(item.filename)||typeof item.file!=='string'||item.file.length>6_990_508||item.file.length%4!==0||/[^A-Za-z0-9+/=]/.test(item.file))throw new SocialError('Seleccione archivos PDF de hasta 5 MB cada uno.',413);let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(item.file),c=>c.charCodeAt(0));}catch{throw new SocialError('El PDF no se ha transmitido correctamente.');}const filename=item.filename.replace(/[\\/\r\n\u0000-\u001f"]/g,'_');const hash=await sha(bytes);for(const doc of await extractSocialPdf(bytes,filename,companyProfile().shortName))allFiles.push({bytes,doc,hash});}
 const groups=new Map<string,typeof allFiles>();
 for(const f of allFiles){const key=liquidationIdentity(f.doc),group=groups.get(key)||[];group.push(f);groups.set(key,group);}
 const liquidations=[];
 for(const [key,group] of groups){
  const docs=group.map(f=>f.doc);compareSocialDocuments(docs);
  if(p.files.length===2&&docs.length!==2)throw new SocialError('La RNT y el RLC deben incluir las mismas liquidaciones (CCC y periodo). Seleccione los PDF correspondientes o presente un solo tipo de documento.');
  const h=docs[0].header;
  liquidations.push({id:await sha(key),company:h.company,ccc:h.ccc,periodFrom:h.periodFrom,periodTo:h.periodTo,workers:h.workers,kinds:docs.map(d=>d.kind).sort().reverse().join(' + '),total:docs.find(d=>d.kind==='RLC')?.total??null});
 }
 if(p.action==='register'&&liquidations.length>1&&!p.liquidation)throw new SocialError('Seleccione la liquidación que desea presentar.');
 const selectedLiquidation=p.liquidation===undefined?liquidations[0].id:p.liquidation;
 const selected=liquidations.findIndex(l=>l.id===selectedLiquidation);
 if(selected<0)throw new SocialError('La liquidación seleccionada no se encuentra en estos PDF. Vuelva a revisarlos.');
 const files=[...groups.values()][selected],documents=files.map(f=>f.doc);const fingerprint=await sha(canonicalSocial(documents)),keys=await Promise.all(documents.map(d=>sha(socialIdentity(d)))),liqKey=await sha(liquidationIdentity(documents[0])),signature=liquidationSignature(documents[0]);
 const companions=await db().prepare('SELECT data FROM social_documents WHERE company_id=? AND liquidation_key=?').bind(companyId(),liqKey).all<{data:string}>();for(const c of companions.results){const d=JSON.parse(c.data) as SocialDocument;for(const incoming of documents)if(incoming.kind!==d.kind)compareSocialDocuments([incoming,d]);}
 const previous=await duplicates(keys),warnings=[...new Set(documents.flatMap(d=>d.warnings))];
 if(p.action==='preview')return json({documents,fingerprint,warnings,duplicates:previous,liquidations,selectedLiquidation});
 if(p.consent!==true)throw new SocialError('Confirme que ha revisado los datos antes de presentar.');if(warnings.length&&p.warningsAccepted!==true)throw new SocialError('Revise y acepte las observaciones.');if(p.fingerprint!==fingerprint)throw new SocialError('Los documentos han cambiado. Vuelva a importarlos y revise sus datos.',409);
 const id=uuid(p.id),date=socialValidDate(p.submissionDate),existing=await stored(id);if(existing){if(existing.fingerprint===fingerprint&&existing.submissionDate===date)return json(await receipt(id));throw new SocialError('Esta referencia corresponde a otra presentación.',409,existing.id);}
 if(previous.length)throw new SocialError('Ya existe un documento de este tipo para la misma liquidación. Consulte su justificante; no se ha duplicado la presentación.',409,previous[0].batchId);
 const h=documents[0].header,now=new Date().toISOString(),reference='SIM-TGSS-'+date.slice(0,4)+'-'+id.replaceAll('-','').slice(0,12).toUpperCase(),uploadKey=`social/${companyId()}/${id}/${newMailId()}`;
 const entries=files.map((f,i)=>({kind:f.doc.kind,identityKey:keys[i],liquidationKey:liqKey,signature:liquidationSignature(f.doc),data:JSON.stringify(f.doc),pdfKey:uploadKey+'/'+f.doc.kind+'.pdf',hash:f.hash}));
 const cleanup=async()=>{for(const e of entries)await bucket().delete(e.pdfKey);};
 try{for(let i=0;i<files.length;i++)await bucket().put(entries[i].pdfKey,files[i].bytes,{httpMetadata:{contentType:'application/pdf'}});
  await db().batch([
   db().prepare(`INSERT INTO social_batches(id,company_id,reference,company,ccc,period_from,period_to,kinds,workers,total,submission_date,created_at,warnings,fingerprint,upload_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM social_documents WHERE company_id=?)+?<=3000 AND NOT EXISTS(SELECT 1 FROM social_documents WHERE company_id=? AND liquidation_key=? AND signature<>?)`).bind(id,companyId(),reference,h.company,h.ccc,h.periodFrom,h.periodTo,documents.map(d=>d.kind).sort().reverse().join(' + '),h.workers,documents.find(d=>d.kind==='RLC')?.total??null,date,now,JSON.stringify(warnings),fingerprint,uploadKey,companyId(),files.length,companyId(),liqKey,signature),
   db().prepare(`INSERT INTO social_documents(company_id,batch_id,kind,identity_key,liquidation_key,signature,data,pdf_key,file_hash) SELECT ?,?,json_extract(value,'$.kind'),json_extract(value,'$.identityKey'),json_extract(value,'$.liquidationKey'),json_extract(value,'$.signature'),json_extract(value,'$.data'),json_extract(value,'$.pdfKey'),json_extract(value,'$.hash') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM social_batches WHERE id=? AND upload_key=?)`).bind(companyId(),id,JSON.stringify(entries),id,uploadKey),
  ]);
 }catch(e){const raced=await stored(id);if(raced?.uploadKey!==uploadKey)await cleanup();if(raced){if(raced.fingerprint===fingerprint&&raced.submissionDate===date)return json(await receipt(id));throw new SocialError('La referencia ya está utilizada por otra presentación.',409,raced.id);}const conflicts=await duplicates(keys);if(conflicts.length)throw new SocialError('Otro equipo acaba de presentar este documento. Consulte el justificante.',409,conflicts[0].batchId);throw e;}
 if(!await stored(id)){await cleanup();throw new SocialError('No se ha registrado: existe un documento incompatible para esta liquidación o se ha alcanzado el límite de 3.000 documentos.',409);}
 return json(await receipt(id),201);
});}
