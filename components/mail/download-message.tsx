'use client';
import {companyFetch} from '@/lib/company-client';

import {useState} from 'react';
import {Download,FileText,Loader2,Mail} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';

export function DownloadMessage({id,onError}:{id:string;onError:(message:string)=>void}){
 const [downloading,setDownloading]=useState(false);
 async function download(format:'pdf'|'eml'){
  if(downloading)return;setDownloading(true);onError('');
  try{
   const response=await companyFetch('/api/correo/exportar?'+new URLSearchParams({id,format}),{cache:'no-store'});
   if(!response.ok){const data=await response.json() as {error?:string};throw Error(data.error||'No se ha podido descargar el correo.');}
   const encoded=response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
   const filename=encoded?decodeURIComponent(encoded):'correo.'+format;
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){onError(e instanceof Error?e.message:'No se ha podido descargar el correo. Vuelve a intentarlo.');}finally{setDownloading(false);}
 }
 return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={downloading}>{downloading?<Loader2 size={17} className="mail-spinning"/>:<Download size={17}/>} {downloading?'Descargando…':'Descargar correo'}</Button></DropdownMenuTrigger><DropdownMenuContent className="mail-download-menu" align="start"><DropdownMenuItem onSelect={()=>void download('pdf')}><FileText size={18}/><span><strong>Documento PDF</strong><small>Mensaje, firma y relación de adjuntos</small></span></DropdownMenuItem><DropdownMenuItem onSelect={()=>void download('eml')}><Mail size={18}/><span><strong>Correo completo (.eml)</strong><small>Incluye los archivos adjuntos</small></span></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
