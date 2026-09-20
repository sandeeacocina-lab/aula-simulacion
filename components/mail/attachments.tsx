'use client';
import {companyUrl} from '@/lib/company-client';

import {useId,useState} from 'react';
import {Paperclip,Download,Eye,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {newMailId} from '@/lib/mail-types';
import {FILE_ACCEPT,checkFiles,fileSize,type MailAttachment,type PendingAttachment} from '@/lib/mail-files';

export function AttachmentPicker({saved=[],files,onChange,onRemove,disabled=false}:{saved?:MailAttachment[];files:PendingAttachment[];onChange:(files:PendingAttachment[])=>void;onRemove?:(id:string)=>void;disabled?:boolean}){
 const inputId=useId(),[error,setError]=useState('');
 return <div className="mail-attachment-picker">
  <label htmlFor={inputId} className="mail-attach-label"><Paperclip size={17}/>Adjuntar archivos</label>
  <input id={inputId} type="file" multiple accept={FILE_ACCEPT} disabled={disabled} aria-describedby={inputId+'-help'} onChange={e=>{
   const selected=Array.from(e.target.files||[]),next=[...files,...selected.map(file=>({id:newMailId(),file}))];
   const problem=checkFiles([...saved,...next.map(f=>f.file)]);setError(problem);if(!problem)onChange(next);e.target.value='';
  }}/>
  <p id={inputId+'-help'} className="mail-attachment-help">Hasta 5 archivos · 5 MB por archivo · 10 MB en total.</p>
  {(saved.length>0||files.length>0)&&<ul className="mail-attachments">{saved.map(f=><li key={f.id}><Paperclip size={16}/><span><strong>{f.name}</strong><small>{fileSize(f.size)} · Guardado</small></span><Button type="button" variant="ghost" aria-label={'Quitar '+f.name} disabled={disabled} onClick={()=>{onRemove?.(f.id);setError('');}}><X size={16}/></Button></li>)}{files.map(f=><li key={f.id}><Paperclip size={16}/><span><strong>{f.file.name}</strong><small>{fileSize(f.file.size)} · Se guardará con el mensaje</small></span><Button type="button" variant="ghost" aria-label={'Quitar '+f.file.name} disabled={disabled} onClick={()=>{onChange(files.filter(x=>x.id!==f.id));setError('');}}><X size={16}/></Button></li>)}</ul>}
  {error&&<p className="mail-error" role="alert">{error}</p>}
 </div>;
}
export function MessageAttachments({messageId,files}:{messageId:string;files:MailAttachment[]}){
 if(!files.length)return null;
 return <section className="mail-message-attachments" aria-label="Archivos adjuntos"><h3><Paperclip size={18}/>{files.length} {files.length===1?'archivo adjunto':'archivos adjuntos'}</h3><ul className="mail-attachments">{files.map(f=>{
  const url='/api/correo/adjuntos?'+new URLSearchParams({message:messageId,file:f.id});
  const preview=['application/pdf','image/png','image/jpeg','image/webp'].includes(f.type);
  return <li key={f.id}><Paperclip size={18}/><span><strong>{f.name}</strong><small>{fileSize(f.size)}</small></span><div className="mail-file-actions">{preview&&<a href={companyUrl(url+'&preview=1')} target="_blank" rel="noreferrer" aria-label={'Abrir '+f.name}><Eye size={16}/>Abrir</a>}<a href={companyUrl(url)} download={f.name} aria-label={'Descargar '+f.name}><Download size={16}/>Descargar</a></div></li>;
 })}</ul></section>;
}
