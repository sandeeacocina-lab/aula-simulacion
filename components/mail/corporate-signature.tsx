'use client';
import type {CSSProperties} from 'react';
import {clientCompany} from '@/lib/company-client';

export function CorporateSignature({name}:{name:string}){
 const profile=clientCompany(),person=name.trim()&&name.trim()!==profile.name?name.trim():'';
 const logo=<img src={profile.logo} width="130" height="42" alt={profile.name}/>;
 return <div className="mail-signature mail-company-signature" style={{'--signature-color':profile.accent} as CSSProperties} aria-label={'Firma corporativa de '+profile.shortName}>
  {profile.website?<a href={profile.website} target="_blank" rel="noopener noreferrer" className="mail-signature-logo" aria-label={'Web de '+profile.name}>{logo}</a>:<span className="mail-signature-logo">{logo}</span>}
  <div className="mail-signature-details">
   <strong>{person||profile.name}</strong>
   {person&&<span className="mail-signature-company">{profile.name}</span>}
   <span>{profile.activity}</span>
   <div className="mail-signature-contact"><span>{profile.mailbox}</span>{profile.website&&<a href={profile.website} target="_blank" rel="noopener noreferrer">Web de {profile.shortName}</a>}</div>
  </div>
 </div>;
}
