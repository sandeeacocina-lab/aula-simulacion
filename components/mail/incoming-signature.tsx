'use client';
import type {CSSProperties} from 'react';
import {signatureBrand,type MailSignature} from '@/lib/mail-signature';

export function IncomingSignature({signature:s,extraLines=[]}:{signature:MailSignature;extraLines?:string[]}){
 const brand=signatureBrand(s),profile=brand?{logo:brand==='arrea'?'./arrea-logo.png':'./decasarre-logo.png',name:brand==='arrea'?'ARREA Eventos':'DECASARRE'}:null;
 return <section className="mail-signature mail-incoming-signature" style={{'--signature-color':s.color} as CSSProperties} aria-label={'Firma corporativa de '+(s.organization||s.name)}>
  {profile&&<div className="mail-signature-logo"><img src={profile.logo} width="130" height="37" alt={profile.name}/></div>}
  <div className="mail-signature-details">
   <strong>{s.name||s.organization}</strong>
   {s.role&&<span>{s.role}</span>}
   {s.name&&s.organization&&<span className="mail-signature-company">{s.organization}</span>}
   {s.location&&<span>{s.location}</span>}
   {extraLines.map((line,i)=><span key={i}>{line}</span>)}
   <div className="mail-signature-contact">{s.email&&<span>{s.email}</span>}{s.phone&&<span>{s.phone}</span>}{s.website&&<a href={s.website} target="_blank" rel="noopener noreferrer">{s.website.replace(/^https?:\/\//,'').replace(/\/$/,'')}</a>}</div>
  </div>
 </section>;
}
