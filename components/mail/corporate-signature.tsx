'use client';
import {clientCompany,companyUrl} from '@/lib/company-client';

export function CorporateSignature({name}:{name:string}){
 const person=name.trim()&&name.trim()!==`${clientCompany().name}`?name.trim():'';
 return <div className="mail-signature" aria-label={`Firma corporativa de ${clientCompany().shortName}`}>
  <span className="mail-signature-logo"><img src={clientCompany().logo} width="130" height="42" alt="Empresa de prácticas"/></span>
  <div className="mail-signature-details">
   <strong>{person||`${clientCompany().name}`}</strong>
   {person&&<span className="mail-signature-company">{clientCompany().name}</span>}
   <span>{clientCompany().activity}</span>
   <div className="mail-signature-contact"><span>{clientCompany().mailbox}</span></div>
  </div>
 </div>;
}
