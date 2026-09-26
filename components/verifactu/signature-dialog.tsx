import {useEffect,useState,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {Button} from '../ui/button';
import {practiceSignature,type Invoice,type PracticeSignature} from '../../lib/verifactu/model';

export function SignatureDialog({open,onOpenChange,invoice,busy,error,canSign=true,onSign,children}:{open:boolean;onOpenChange:(open:boolean)=>void;invoice:Invoice|undefined;busy:boolean;error:string;canSign?:boolean;onSign:(signature:PracticeSignature)=>void;children:ReactNode}){
 const [selected,setSelected]=useState(false),[conform,setConform]=useState(false);
 useEffect(()=>{if(open){setSelected(false);setConform(false);}},[open,invoice?.id]);
 if(!invoice)return null;
 const certificate=practiceSignature(invoice);
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value);}}><DialogContent className="vf-sign-dialog">
  <DialogTitle>{selected?'Firma y envío de la factura':'Seleccionar un certificado'}</DialogTitle>
  <DialogDescription>{selected?'Revisa los datos y confirma la actuación con el certificado de prácticas.':'Identificación mediante el certificado ficticio de tu empresa de prácticas.'}</DialogDescription>
  <div className="vf-certificate"><strong>{certificate.holder}</strong><span>NIF {certificate.nif}</span><small>{certificate.certificate} · Certificado de prácticas</small></div>
  {selected?<>
   {children}
   <label className="vf-conform"><input type="checkbox" checked={conform} disabled={busy} onChange={e=>setConform(e.target.checked)}/><strong>Conforme</strong></label>
   <p className="vf-hint">Firma simulada con certificado ficticio. Sin validez tributaria ni envío a la AEAT.</p>
   {error&&<p role="alert" className="vf-error">{error}</p>}
   <div className="vf-actions"><Button variant="outline" disabled={busy} onClick={()=>{setSelected(false);setConform(false);}}>Volver</Button><Button disabled={busy||!conform||!canSign} onClick={()=>onSign(certificate)}>{busy?'Firmando y registrando…':'Firmar y enviar'}</Button></div>
  </>:<><p className="vf-hint">La selección reproduce el uso de un certificado electrónico sin instalar ni aportar uno real.</p><div className="vf-actions"><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>Cancelar</Button><Button disabled={busy} onClick={()=>setSelected(true)}>Seleccionar certificado</Button></div></>}
 </DialogContent></Dialog>;
}
