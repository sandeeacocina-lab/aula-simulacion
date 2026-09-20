export const MAX_FILES=5;
export const MAX_FILE_BYTES=5*1024*1024;
export const MAX_TOTAL_BYTES=10*1024*1024;
export const FILE_ACCEPT='.pdf,.xml,.csv,.txt,.doc,.docx,.xls,.xlsx,.odt,.ods,.png,.jpg,.jpeg,.webp,.zip';
export type MailAttachment={id:string;name:string;size:number;type:string};
export type PendingAttachment={id:string;file:File};
export function fileSize(size:number){return size>=1024*1024?(size/1024/1024).toLocaleString('es-ES',{maximumFractionDigits:1})+' MB':Math.max(1,Math.ceil(size/1024))+' KB';}
export function checkFiles(files:{name:string;size:number}[]){
 if(files.length>MAX_FILES)return 'Puedes adjuntar hasta 5 archivos por mensaje.';
 for(const f of files){
  if(!FILE_ACCEPT.split(',').some(ext=>f.name.toLowerCase().endsWith(ext)))return 'Formato no admitido: '+f.name+'. Usa PDF, XML, documentos, hojas de cálculo, imágenes o ZIP.';
  if(!f.size)return 'El archivo '+f.name+' está vacío.';
  if(f.size>MAX_FILE_BYTES)return 'El archivo '+f.name+' supera los 5 MB.';
 }
 if(files.reduce((n,f)=>n+f.size,0)>MAX_TOTAL_BYTES)return 'Los adjuntos no pueden superar 10 MB en total.';
 return '';
}
export function messageForm(data:Record<string,unknown>,files:PendingAttachment[]){
 const form=new FormData();form.set('message',JSON.stringify(data));
 for(const f of files)form.append('files',f.file,f.file.name);
 return form;
}
