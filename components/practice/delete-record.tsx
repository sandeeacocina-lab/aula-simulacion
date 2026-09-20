import {practiceStorage as localStorage} from '@/lib/local/storage';
'use client';
import {companyStorageKey,companyFetch,clientCompany} from '@/lib/company-client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {Trash2} from 'lucide-react';
type Preview={token:string;counts:Record<string,number>;notes:string[]};
export function clearTaxPractice(){for(const key of localStorage.keys())if(key.startsWith('aula-'))localStorage.removeItem(key);}
export function DeleteRecord({scope,id,label='Borrar',title,onDeleted,localDelete,description}:{scope?:string;id?:string;label?:string;title:string;onDeleted?:()=>void|Promise<void>;localDelete?:()=>void|Promise<void>;description?:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(''),[preview,setPreview]=useState<Preview|null>(null);
 async function send(action:string,token?:string){const r=await companyFetch('/api/practicas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,id,action,token,confirm:'BORRAR'})});const d=await r.json() as Preview&{error?:string};if(!r.ok)throw Error(d.error||'No se ha podido completar el borrado.');return d;}
 async function start(){setOpen(true);setBusy(true);setError('');setConfirm('');setPreview(null);try{if(scope)setPreview(await send('preview'));else setPreview({token:'local',counts:{},notes:[]});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function erase(){setBusy(true);setError('');try{if(scope)await send('delete',preview?.token);if(localDelete)await localDelete();setOpen(false);if(onDeleted)await onDeleted();}catch(e){setError((e as Error).message);setPreview(null);}finally{setBusy(false);}}
 return <><Button type="button" variant="outline" size="sm" className="practice-delete" onClick={()=>void start()} aria-label={label+': '+title}><Trash2 size={15}/>{label}</Button><AlertDialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><AlertDialogContent className="practice-dialog"><AlertDialogTitle>{id?'Borrar registro':'Borrar datos de prácticas'}</AlertDialogTitle><AlertDialogDescription>{title}. {description||'El borrado es permanente. Podrás volver a registrar los mismos datos.'}</AlertDialogDescription>{scope&&<p className="practice-shared">Afecta solo a esta práctica en este navegador.</p>}{busy&&!preview?<p role="status">Preparando el borrado…</p>:preview&&<>{Object.values(preview.counts).some(Boolean)&&<ul>{Object.entries(preview.counts).filter(([,n])=>n>0).map(([s,n])=><li key={s}>{s}: <strong>{n}</strong></li>)}</ul>}{preview.notes.map(n=><p key={n}>{n}</p>)}{!id&&<label>Escribe BORRAR para confirmar<Input autoComplete="off" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label>}</>}{error&&<p role="alert" className="practice-error">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><Button type="button" className="practice-confirm-delete" disabled={busy||!preview||(!id&&confirm!=='BORRAR')} onClick={()=>void erase()}>{busy?(preview?'Borrando…':'Preparando…'):'Confirmar borrado'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
