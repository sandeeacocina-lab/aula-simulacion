'use client';
import {companyFetch,companyUrl} from '@/lib/company-client';

import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Download,Printer} from 'lucide-react';
import {socialDate,type SocialReceipt} from '@/lib/social-types';
import type {RegistryRecord} from '@/lib/social-registry-types';
import {socialRoot} from '@/lib/social-registry-types';
import {contributionSummary,registrySummary,registerDate,type ReceiptSummary} from '@/lib/social-receipt-data';
import {DocumentDetails} from './document-details';
import {ReceiptSections} from './receipt-sections';
import {SocialNotice,SocialBrand} from './sede-header';
export default function SocialReceiptPage(){
 const [receipt,setReceipt]=useState<SocialReceipt|null>(null),[summary,setSummary]=useState<ReceiptSummary|null>(null),[pdfUrl,setPdfUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;const p=new URLSearchParams((window.location.hash.split('?')[1]||'')),id=p.get('registro')||p.get('id'),isRegistry=p.has('registro');if(!id){setError('Falta la referencia de presentación.');return;}void companyFetch(isRegistry?'/api/seguridad-social/registro?'+new URLSearchParams({id}):'/api/seguridad-social?'+new URLSearchParams({batch:id}),{cache:'no-store'}).then(async r=>{const d=await r.json() as SocialReceipt&{record:RegistryRecord;error?:string};if(!r.ok)throw Error(d.error);if(active){if(isRegistry){setSummary(registrySummary(d.record as RegistryRecord));setPdfUrl('/api/seguridad-social/registro?'+new URLSearchParams({id,pdf:'1'}));}else{setReceipt(d);setSummary(contributionSummary(d));setPdfUrl('/api/seguridad-social?'+new URLSearchParams({batch:id,receipt:'pdf'}));}}}).catch(e=>{if(active)setError(e.message||'No se puede consultar el justificante.');});return()=>{active=false;};},[]);
 return <div className="social-app ss-receipt-app"><SocialNotice/><div className="ss-receipt-tools"><a href={companyUrl(socialRoot+(receipt?'/cotizacion':'/registros'))}>Volver a la consulta</a>{summary&&<div className="ss-actions"><Button asChild><a href={companyUrl(pdfUrl)}><Download size={17}/>Descargar justificante PDF</a></Button><Button variant="outline" onClick={()=>window.print()}><Printer size={17}/>Imprimir</Button></div>}</div><main className="ss-paper ss-compact-paper"><header className="ss-paper-header"><SocialBrand/></header>{error?<div role="alert" className="ss-error">{error}</div>:!summary?<p role="status">Consultando justificante…</p>:<><div className="ss-paper-kicker">TESORERÍA GENERAL DE LA SEGURIDAD SOCIAL</div><h1>{summary.title}</h1><p className="ss-paper-subtitle">{summary.subtitle}</p><section className="ss-register-box"><div><span>Referencia de registro</span><strong>{summary.reference}</strong></div><dl><div><dt>Fecha de presentación</dt><dd>{socialDate(summary.date)}</dd></div><div><dt>Registro del sistema (Madrid)</dt><dd>{registerDate(summary.createdAt)}</dd></div><div><dt>Estado</dt><dd>Registrado</dd></div></dl></section><ReceiptSections sections={summary.sections}/><p className="ss-receipt-note">{summary.note}</p><footer><strong>SIMULACIÓN EDUCATIVA · SIN VALIDEZ ADMINISTRATIVA</strong><span>{summary.reference}</span></footer></>}</main>
 {receipt&&<section className="ss-receipt-annex"><h2>Documentos del expediente</h2><div className="ss-originals">{receipt.documents.map(d=><Button key={d.kind} variant="outline" asChild><a href={companyUrl('/api/seguridad-social?'+new URLSearchParams({batch:receipt.batch.id,pdf:d.kind}))}><Download size={16}/>PDF original · {d.kind}</a></Button>)}</div><details><summary>Consultar el detalle de los documentos y las observaciones</summary>{receipt.documents.map(d=><DocumentDetails key={d.kind} document={d}/>)}{receipt.batch.warnings.length>0&&<section className="ss-receipt-warnings"><h2>Observaciones aceptadas</h2><ul>{receipt.batch.warnings.map(w=><li key={w}>{w}</li>)}</ul></section>}</details></section>}
 </div>;
}
