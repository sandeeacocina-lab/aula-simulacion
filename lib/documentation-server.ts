import {newMailId} from '@/lib/mail-types';
import {env,allFiles} from './local/runtime';
import {safeName} from './mail-attachments';
import {checkDocuments,DOCUMENT_CATEGORIES,DOCUMENT_STATUSES,type Assignment,type PracticeDocument} from './documentation-types';

class DocumentError extends Error{constructor(message:string,public status=400){super(message);}}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const validId=(value:unknown)=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
function text(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||(required&&!value.trim()))throw new DocumentError('Revisa los datos del encargo.');return value.trim();}
function shuffled<T>(values:T[]){const copy=[...values];for(let i=copy.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
const fileType=(name:string)=>({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[name.toLowerCase().split('.').pop()||'']||'application/octet-stream');
async function assignment(id:string){const row=await env.DB.prepare('SELECT * FROM documentation_assignments WHERE id=?').bind(id).first<Assignment>();if(!row)throw new DocumentError('El encargo ya no existe. Actualiza la bandeja.',404);return row;}
function checkRevision(actual:number,received:unknown){if(actual!==received)throw new DocumentError('El documento o el encargo ha cambiado. Actualiza la bandeja antes de guardar.',409);}

export async function readDocumentation(request:Request){try{
 const params=new URL(request.url).searchParams,id=params.get('file');
 if(id){
  const file=await env.DB.prepare('SELECT * FROM documentation_files WHERE id=?').bind(id).first<PracticeDocument&{file_key:string}>();
  if(!file)throw new DocumentError('El documento ya no existe.',404);
  const stored=await env.BUCKET.get(file.file_key);if(!stored||stored.size!==file.size)throw new DocumentError('No se ha podido recuperar el documento.',404);
  const type=fileType(file.name),inline=params.get('preview')==='1'&&type!=='application/octet-stream';
  const encoded=encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(stored.body,{headers:{'Content-Type':type,'Content-Length':String(stored.size),'Content-Disposition':`${inline?'inline':'attachment'}; filename="documento"; filename*=UTF-8''${encoded}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store'}});
 }
 const assignments=(await env.DB.prepare("SELECT a.*,COUNT(f.id) AS total,COALESCE(SUM(f.status='completado'),0) AS completed FROM documentation_assignments a LEFT JOIN documentation_files f ON f.assignment_id=a.id GROUP BY a.id ORDER BY a.created_at DESC,a.id").all<Assignment>()).results;
 const documents=(await env.DB.prepare('SELECT id,assignment_id,name,type,size,position,category,status,notes,revision FROM documentation_files ORDER BY position,id').all<PracticeDocument>()).results;
 return json({assignments,documents});
 }catch(e){if(e instanceof DocumentError)return json({error:e.message},e.status);throw e;}}

export async function writeDocumentation(request:Request){try{
 let p:Record<string,unknown>,files:File[]=[];
 if(request.headers.get('content-type')?.includes('multipart/form-data')){
  const form=await request.formData(),raw=form.get('assignment');if(typeof raw!=='string'||raw.length>15000)throw new DocumentError('El encargo no es válido.');
  try{p=JSON.parse(raw);}catch{throw new DocumentError('El encargo no es válido.');}
  const uploads=form.getAll('files');if(uploads.some(value=>typeof value==='string'))throw new DocumentError('Los documentos no son válidos.');files=uploads as File[];
 }else{
  const raw=await request.text();if(raw.length>15000)throw new DocumentError('Los datos superan el tamaño permitido.');
  try{p=JSON.parse(raw);}catch{throw new DocumentError('Los datos no son válidos.');}
 }
 if(!p||typeof p!=='object'||Array.isArray(p)||!validId(p.id))throw new DocumentError('Referencia no válida.');
 const id=p.id as string;
 if(p.action==='create'||p.action==='edit'){
  const title=text(p.title,120,true),period=text(p.period,80),instructions=text(p.instructions,12000);
  if(p.action==='create'){
   if(await env.DB.prepare('SELECT id FROM documentation_assignments WHERE id=?').bind(id).first())throw new DocumentError('Este encargo ya existe.',409);
  }else checkRevision((await assignment(id)).revision,p.revision);
  const count=Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM documentation_files WHERE assignment_id=?').bind(id).first<number>('n'));
  const error=checkDocuments(files,count);if(error)throw new DocumentError(error);
  const existingBytes=[...await allFiles()].reduce((sum,[,file])=>sum+file.bytes.length,0);
  if(existingBytes+files.reduce((sum,file)=>sum+file.size,0)>60*1024*1024)throw new DocumentError('Los archivos de esta práctica superarían los 60 MB. Retira los que no necesites antes de añadir más.');
  if(p.action==='create')await env.DB.prepare('INSERT INTO documentation_assignments(id,title,period,instructions,created_at) VALUES (?,?,?,?,?)').bind(id,title,period,instructions,new Date().toISOString()).run();
  else await env.DB.prepare('UPDATE documentation_assignments SET title=?,period=?,instructions=?,revision=revision+1 WHERE id=?').bind(title,period,instructions,id).run();
  const position=Number(await env.DB.prepare('SELECT COALESCE(MAX(position)+1,0) AS n FROM documentation_files WHERE assignment_id=?').bind(id).first<number>('n'));
  for(const [index,file] of shuffled(files).entries()){
   const documentId=newMailId(),key=`documentation/demo/${id}/${documentId}`,name=safeName(file.name),type=fileType(name);
   await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:type}});
   await env.DB.prepare('INSERT INTO documentation_files(id,assignment_id,name,file_key,type,size,position) VALUES (?,?,?,?,?,?,?)').bind(documentId,id,name,key,type,file.size,position+index).run();
  }
  return json({id},p.action==='create'?201:200);
 }
 if(p.action==='classify'){
  const file=await env.DB.prepare('SELECT * FROM documentation_files WHERE id=?').bind(id).first<PracticeDocument>();if(!file)throw new DocumentError('El documento ya no existe.',404);checkRevision(file.revision,p.revision);
  if(typeof p.category!=='string'||!Object.hasOwn(DOCUMENT_CATEGORIES,p.category)||typeof p.status!=='string'||!Object.hasOwn(DOCUMENT_STATUSES,p.status))throw new DocumentError('La clasificación no es válida.');
  const notes=text(p.notes,4000);
  await env.DB.prepare('UPDATE documentation_files SET category=?,status=?,notes=?,revision=revision+1 WHERE id=?').bind(p.category,p.status,notes,id).run();
  return json({id});
 }
 if(p.action==='shuffle'){
  checkRevision((await assignment(id)).revision,p.revision);
  const documents=(await env.DB.prepare('SELECT id FROM documentation_files WHERE assignment_id=? ORDER BY position,id').bind(id).all<{id:string}>()).results;
  for(const [index,file] of shuffled(documents).entries())await env.DB.prepare('UPDATE documentation_files SET position=?,revision=revision+1 WHERE id=?').bind(index,file.id).run();
  await env.DB.prepare('UPDATE documentation_assignments SET revision=revision+1 WHERE id=?').bind(id).run();
  return json({id});
 }
 throw new DocumentError('Operación no válida.');
 }catch(e){if(e instanceof DocumentError)return json({error:e.message},e.status);throw e;}}
