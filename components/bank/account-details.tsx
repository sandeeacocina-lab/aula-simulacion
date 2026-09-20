'use client';
import {companyFetch,clientCompany} from '@/lib/company-client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {BankAccount} from '@/lib/bank-types';
export function AccountDetails({account,onChanged}:{account:BankAccount;onChanged:()=>void}){
 const [open,setOpen]=useState(false),[iban,setIban]=useState(''),[reviewed,setReviewed]=useState(account),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await companyFetch('/api/banco',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'account-iban',iban,revision:reviewed.revision,accountCreatedAt:reviewed.createdAt,consent:true})}),d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error);setOpen(false);onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><Button variant="outline" onClick={()=>{setReviewed(account);setIban(account.iban);setError('');setOpen(true);}}>Datos de la cuenta</Button><Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="bank-operation-dialog"><DialogTitle>Datos de la cuenta · {clientCompany().shortName}</DialogTitle><DialogDescription>Indique el IBAN del supuesto para utilizarlo en las operaciones y domiciliaciones.</DialogDescription><form onSubmit={save}><label className="bank-field"><span>IBAN de la cuenta</span><Input value={iban} maxLength={40} required onChange={e=>setIban(e.target.value.toUpperCase())} placeholder="ES00 0000 0000 0000 0000 0000" disabled={busy}/></label><p>Los justificantes de operaciones anteriores conservan su cuenta de cargo.</p>{error&&<p role="alert" className="bank-error">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Guardando…':'Guardar IBAN'}</Button></form></DialogContent></Dialog></>;
}
