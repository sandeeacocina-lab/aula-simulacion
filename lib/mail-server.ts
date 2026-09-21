import {companyId,companyProfile} from './company-server';
import {env} from '@/lib/local/runtime';
import {FOLDERS,type MailMessage,type Folder} from './mail-types';
import {MailError} from './mail-error';
import {MAX_TOTAL_BYTES} from './mail-files';
import {attachmentPlan,attachmentResponse,publicAttachments,storedAttachments,putAttachments,removeAttachments,exportAttachments} from './mail-attachments';
import {mailEML,mailExportHeaders} from './mail-export';
import {normalizeSignature,storedSignature} from './mail-signature';
const fields='id, company_id AS companyId, sender_name AS senderName, sender_address AS senderAddress, recipient, subject, body, source, folder, home_folder AS homeFolder, is_read AS isRead, revision, reply_to AS replyTo, created_at AS createdAt, updated_at AS updatedAt, attachments AS attachmentManifest, corporate_signature AS signatureManifest';
type RawMessage=Omit<MailMessage,'attachments'|'signature'>&{attachmentManifest:string;signatureManifest:string};
function publicMessage(raw:RawMessage):MailMessage{const {attachmentManifest,signatureManifest,...m}=raw;return {...m,attachments:publicAttachments(attachmentManifest),signature:storedSignature(signatureManifest)};}
function db(){if(!env.DB)throw new MailError('El correo no está disponible temporalmente. Conserva el texto y vuelve a intentarlo.',503);return env.DB;}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function text(value:unknown,label:string,max:number,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new MailError('Revisa '+label+'.');return value.trim();}
function email(value:unknown,required=true){const v=text(value??'','el correo electrónico',120,required).toLowerCase();if(v&&!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(v))throw new MailError('Introduce una dirección de correo válida.');return v;}
function id(value:unknown){if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new MailError('Identificador de mensaje no válido.');return value;}
async function rawMessage(key:string){return db().prepare(`SELECT ${fields} FROM mail_messages WHERE company_id=? AND id=?`).bind(companyId(),key).first<RawMessage>();}
async function message(key:string){const m=await rawMessage(key);if(!m)throw new MailError('El mensaje ya no está disponible. Actualiza la bandeja.',404);return publicMessage(m);}
async function rateLimit(request:Request){
 const n=await db().prepare('SELECT COUNT(*) AS n FROM mail_messages WHERE company_id=?').bind(companyId()).first<{n:number}>();
 if((n?.n||0)>=5000)throw new MailError('El buzón ha alcanzado su capacidad de prácticas. Contacta con tu docente.',409);
}
async function payload(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new MailError('Abre el formulario de contacto de la central para enviar el mensaje.',403);
 const contentType=request.headers.get('content-type')||'',multipart=contentType.includes('multipart/form-data');
 if(!multipart&&!contentType.includes('application/json'))throw new MailError('Formato de envío no admitido.',415);
 const limit=multipart?MAX_TOTAL_BYTES+100000:60000;
 if(Number(request.headers.get('content-length')||0)>limit)throw new MailError('El mensaje o sus adjuntos superan el tamaño permitido.',413);
 const reader=request.body?.getReader();if(!reader)throw new MailError('Falta el mensaje.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new MailError('El mensaje o sus adjuntos superan el tamaño permitido.',413);}chunks.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
 try{
  let body:string,files:File[]=[];
  if(multipart){const form=await new Response(buffer,{headers:{'Content-Type':contentType}}).formData();const value=form.get('message');if(typeof value!=='string'||value.length>60000)throw 0;body=value;const parts=form.getAll('files');if(parts.some(f=>typeof f==='string'))throw 0;files=parts as File[];}
  else body=new TextDecoder().decode(buffer);
  const p=JSON.parse(body);if(!p||typeof p!=='object'||Array.isArray(p))throw 0;return {p:p as Record<string,unknown>,files};
 }catch{throw new MailError('No se ha podido leer el mensaje.');}
}
async function boundary(run:()=>Promise<Response>){try{return await run();}catch(e){if(e instanceof MailError)return json({error:e.message},e.status);console.error('Mailbox operation failed',e instanceof Error?e.message:'Unknown error');return json({error:'No se ha podido completar la operación. Conserva el texto y vuelve a intentarlo.'},503);}}
export function listMail(request:Request){return boundary(async()=>{
 const url=new URL(request.url);if(url.searchParams.has('id'))return json({message:await message(id(url.searchParams.get('id')))});
 const folder=url.searchParams.get('folder')||'inbox';if(!FOLDERS.includes(folder as Folder))throw new MailError('Carpeta no válida.');
 const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>10000)throw new MailError('Página no válida.');
 const q=(url.searchParams.get('q')||'').trim().slice(0,120).replace(/[\\%_]/g,'\\$&');
 const where="company_id=? AND folder=? AND (subject LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\' OR sender_address LIKE ? ESCAPE '\\' OR recipient LIKE ? ESCAPE '\\')";
 const args=[companyId(),folder,...Array(4).fill('%'+q+'%')];
 const results=await db().batch([
  db().prepare(`SELECT ${fields.replace('subject, body,','subject, substr(body,1,180) AS body,')} FROM mail_messages WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 40 OFFSET ?`).bind(...args,page*40),
  db().prepare(`SELECT COUNT(*) AS n FROM mail_messages WHERE ${where}`).bind(...args),
  db().prepare('SELECT folder,COUNT(*) AS n FROM mail_messages WHERE company_id=? GROUP BY folder').bind(companyId()),
  db().prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE company_id=? AND folder='inbox' AND is_read=0").bind(companyId()),
 ]);
 const counts=Object.fromEntries(FOLDERS.map(f=>[f,0]));for(const row of results[2].results as {folder:string;n:number}[])counts[row.folder]=row.n;
 return json({messages:(results[0].results as RawMessage[]).map(raw=>{const {body,...m}=publicMessage(raw);return {...m,preview:body};}),total:(results[1].results[0] as {n:number}).n,counts,unread:(results[3].results[0] as {n:number}).n,page,pageSize:40});
});}
export function downloadMailAttachment(request:Request){return boundary(async()=>{
 const url=new URL(request.url),m=await rawMessage(id(url.searchParams.get('message')));
 if(!m)throw new MailError('El mensaje no está disponible.',404);
 const file=storedAttachments(m.attachmentManifest).find(f=>f.id===id(url.searchParams.get('file')));
 if(!file)throw new MailError('El archivo no pertenece a este mensaje.',404);
 return attachmentResponse(file,url.searchParams.get('preview')==='1');
});}
export function exportMail(request:Request){return boundary(async()=>{
 const url=new URL(request.url),format=url.searchParams.get('format');
 if(format!=='pdf'&&format!=='eml')throw new MailError('Elige PDF o EML para descargar el correo.');
 const raw=await rawMessage(id(url.searchParams.get('id')));
 if(!raw)throw new MailError('El mensaje ya no está disponible. Actualiza la bandeja.',404);
 const m=publicMessage(raw);
 if(format==='pdf'){
  const {mailPDF}=await import('./mail-pdf');
  return new Response(mailPDF(m) as BodyInit,{headers:mailExportHeaders(m,format)});
 }
 const attachments=await exportAttachments(storedAttachments(raw.attachmentManifest));
 return new Response(mailEML(m,attachments),{headers:mailExportHeaders(m,format)});
});}
export function writeMail(request:Request,web=false){return boundary(async()=>{
 const {p,files}=await payload(request);const action=web?'receive':p.action;
 if(web&&p.website)throw new MailError('No se ha podido enviar el mensaje.');
 if(['read','move'].includes(String(action))){
  if(files.length)throw new MailError('Añade los adjuntos al redactar el mensaje.');
  const m=await message(id(p.id));
  if(action==='read'){if(typeof p.isRead!=='boolean')throw new MailError('Estado no válido.');await db().prepare('UPDATE mail_messages SET is_read=? WHERE company_id=? AND id=?').bind(p.isRead?1:0,companyId(),m.id).run();}
  else{if(!['archive','trash','restore'].includes(String(p.folder)))throw new MailError('Destino no válido.');const folder=p.folder==='restore'?m.homeFolder:String(p.folder);const updated=await db().prepare('UPDATE mail_messages SET folder=?,revision=revision+1,updated_at=? WHERE company_id=? AND id=? AND revision=?').bind(folder,new Date().toISOString(),companyId(),m.id,p.revision).run();if(!updated.meta.changes)throw new MailError('Otra persona ha cambiado este mensaje. Actualiza la bandeja.',409);}
  return json({message:await message(m.id)});
 }
 if(!['receive','send','draft'].includes(String(action)))throw new MailError('Acción no válida.');
 const key=id(p.id),incoming=action==='receive',draft=action==='draft';
 let signature=null;try{signature=incoming&&!web?normalizeSignature(p.signature):null;}catch(e){throw new MailError((e as Error).message);}
 const signatureManifest=JSON.stringify(signature);
 const senderName=incoming?text(p.senderName,'el nombre de la empresa',100):(text(p.senderName??'','el nombre de la firma',100,false)||companyProfile().name);
 const senderAddress=incoming?email(p.senderAddress):companyProfile().mailbox;
 const recipient=incoming?companyProfile().mailbox:email(p.recipient,!draft);
 const subject=text(p.subject??'','el asunto',160,!draft),body=text(p.body??'','el mensaje',12000,!draft);
 const replyTo=p.replyTo?id(p.replyTo):null;if(replyTo)await message(replyTo);
 const folder=incoming?'inbox':draft?'drafts':'sent',source=web?'web':incoming?'simulation':'mail',now=new Date().toISOString();
 const existing=await rawMessage(key);
 const current=existing?storedAttachments(existing.attachmentManifest):[];
 const plan=await attachmentPlan(key,p.attachmentIds,files,current);
 const sameText=(m:RawMessage)=>m.subject===subject&&m.body===body&&m.senderName===senderName&&m.senderAddress===senderAddress&&m.recipient===recipient&&m.source===source&&m.homeFolder===folder&&m.replyTo===replyTo&&JSON.stringify(storedSignature(m.signatureManifest))===signatureManifest;
 // A retry after a lost response must retain exactly the saved files and message.
 if(existing&&sameText(existing)&&plan.same)return json(web?{ok:true,reference:existing.id}:{message:publicMessage(existing)});
 if(existing&&(existing.folder!=='drafts'||incoming||!Number.isInteger(p.revision)||p.revision!==existing.revision))throw new MailError('Otra persona ha cambiado este mensaje. Tu texto y archivos se conservan aquí; actualiza antes de guardar.',409);
 if(!existing&&p.revision!==undefined)throw new MailError('Este borrador ya no está disponible. Conserva tu texto y archivos.',409);
 if(!existing||files.length)await rateLimit(request);
 await putAttachments(plan.uploads);
 const manifest=JSON.stringify(plan.manifest);
 let changed=false;
 try{
  if(existing){
   const r=await db().prepare("UPDATE mail_messages SET sender_name=?,recipient=?,subject=?,body=?,folder=?,home_folder=?,revision=revision+1,updated_at=?,created_at=?,attachments=? WHERE company_id=? AND id=? AND revision=? AND folder='drafts'").bind(senderName,recipient,subject,body,folder,folder,now,draft?existing.createdAt:now,manifest,companyId(),key,p.revision).run();
   changed=!!r.meta.changes;
  }else{
   const r=await db().prepare('INSERT INTO mail_messages (id,company_id,sender_name,sender_address,recipient,subject,body,source,folder,home_folder,is_read,revision,reply_to,created_at,updated_at,attachments,corporate_signature) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(key,companyId(),senderName,senderAddress,recipient,subject,body,source,folder,folder,incoming?0:1,replyTo,now,now,manifest,signatureManifest).run();
   changed=!!r.meta.changes;
  }
 }catch(e){
  // A failed response can follow a committed write. Never delete referenced bytes.
  try{const latest=await rawMessage(key);const live=new Set(latest?storedAttachments(latest.attachmentManifest).map(f=>f.key):[]);await removeAttachments(plan.uploads.map(f=>f.meta).filter(f=>!live.has(f.key)));}catch{ /* Keep bytes if commit outcome is unknown. */ }
  throw e;
 }
 if(!changed){
  await removeAttachments(plan.uploads.map(f=>f.meta));
  const latest=await rawMessage(key);
  const same=latest&&sameText(latest)&&await attachmentPlan(key,p.attachmentIds,files,storedAttachments(latest.attachmentManifest));
  if(same&&same.same)return json(web?{ok:true,reference:key}:{message:publicMessage(latest!)});
  throw new MailError('Otra persona ha editado este mensaje. Tu texto y archivos se conservan aquí.',409);
 }
 await removeAttachments(plan.removed);
 if(web)return json({ok:true,reference:key},201);
 return json({message:await message(key)},existing?200:201);
});}
