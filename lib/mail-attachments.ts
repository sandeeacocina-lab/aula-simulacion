import {newMailId} from '@/lib/mail-types';
import {companyId} from './company-server';
import {env} from '@/lib/local/runtime';
import {MailError} from './mail-error';
import {checkFiles,type MailAttachment} from './mail-files';

export type StoredAttachment=MailAttachment&{key:string;sha256:string};
export function storedAttachments(raw:string):StoredAttachment[]{return JSON.parse(raw);}
export function publicAttachments(raw:string):MailAttachment[]{return storedAttachments(raw).map(({id,name,size,type})=>({id,name,size,type}));}
function bucket(){if(!env.BUCKET)throw new MailError('Los adjuntos no están disponibles temporalmente. Conserva los archivos y vuelve a intentarlo.',503);return env.BUCKET;}
export function safeName(name:string){return name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069/\\:"<>|?*]/g,'_').slice(-180).trim()||'archivo';}
function typeFor(name:string){const ext=name.toLowerCase().split('.').pop();return ({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'} as Record<string,string>)[ext||'']||'application/octet-stream';}
export async function attachmentPlan(key:string,ids:unknown,files:File[],current:StoredAttachment[]){
 const keptIds=ids===undefined?current.map(f=>f.id):ids;
 if(!Array.isArray(keptIds)||keptIds.some(x=>typeof x!=='string')||new Set(keptIds).size!==keptIds.length)throw new MailError('La lista de adjuntos no es válida.');
 const kept=keptIds.map(id=>{const f=current.find(f=>f.id===id);if(!f)throw new MailError('Un adjunto ha cambiado. Abre de nuevo el borrador.',409);return f;});
 const error=checkFiles([...kept,...files]);if(error)throw new MailError(error);
 const uploads:{meta:StoredAttachment;bytes:ArrayBuffer}[]=[];
 for(const f of files){
  const bytes=await f.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const id=newMailId(),name=safeName(f.name);
  uploads.push({meta:{id,name,size:f.size,type:typeFor(name),key:`mail/${companyId()}/${key}/${id}`,sha256},bytes});
 }
 const manifest=[...kept,...uploads.map(f=>f.meta)];
 const same=current.length===manifest.length&&current.every((f,i)=>f.name===manifest[i].name&&f.size===manifest[i].size&&f.sha256===manifest[i].sha256);
 return {manifest,uploads,same,removed:current.filter(f=>!keptIds.includes(f.id))};
}
export async function putAttachments(uploads:{meta:StoredAttachment;bytes:ArrayBuffer}[]){
 const written:StoredAttachment[]=[];
 try{for(const f of uploads){await bucket().put(f.meta.key,f.bytes,{httpMetadata:{contentType:f.meta.type}});written.push(f.meta);}}
 catch(e){await removeAttachments(written);throw e;}
}
export async function removeAttachments(files:StoredAttachment[]){
 if(!files.length)return;
 try{await bucket().delete(files.map(f=>f.key));}catch(e){console.error('Attachment cleanup failed',e instanceof Error?e.message:'Unknown error');}
}
export async function attachmentResponse(file:StoredAttachment,preview:boolean){
 const object=await bucket().get(file.key);
 if(!object)throw new MailError('No se ha encontrado el archivo. Vuelve a abrir el mensaje.',404);
 const inline=preview&&['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type);
 const encoded=encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return new Response(object.body,{headers:{
  'Content-Type':file.type,'Content-Length':String(object.size),
  'Content-Disposition':`${inline?'inline':'attachment'}; filename="archivo"; filename*=UTF-8''${encoded}`,
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer',
 }});
}
export async function exportAttachments(files:StoredAttachment[]){
 const error=checkFiles(files);if(error)throw new MailError(error);
 const result:{name:string;type:string;bytes:Uint8Array}[]=[];
 for(const file of files){
  const object=await bucket().get(file.key);
  if(!object||object.size!==file.size)throw new MailError('No se ha podido recuperar un adjunto. Actualiza el mensaje y vuelve a descargarlo.',404);
  result.push({name:file.name,type:file.type,bytes:new Uint8Array(await object.arrayBuffer())});
 }
 return result;
}
