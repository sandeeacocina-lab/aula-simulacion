import type {MailMessage} from './mail-types';

export type MailSignature={name:string;role:string;organization:string;email:string;phone:string;website:string;location:string;color:string};
export const signatureColors=['#187078','#a90045','#164e7a','#963020','#343b42','#555a25','#087f8c'] as const;
export function signatureBrand(s:MailSignature){
 const org=s.organization.trim().toLocaleLowerCase('es').replace(/,?\s+s\.?[al]\.?s?\.?$/,'').trim();
 return org==='arrea eventos'||org==='arrea'?'arrea':org==='decasarre'?'decasarre':null;
}
export function normalizeSignature(value:unknown):MailSignature|null{
 if(value===null||value===undefined)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Revisa los datos de la firma corporativa.');
 const input=value as Record<string,unknown>;
 const field=(key:string,max:number)=>{const v=input[key]??'';if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Revisa los datos de la firma corporativa.');return v.trim();};
 const s={name:field('name',100),role:field('role',120),organization:field('organization',120),email:field('email',120),phone:field('phone',50),website:field('website',240),location:field('location',120),color:field('color',7)||signatureColors[0]};
 if(!s.name&&!s.organization)throw Error('Indica el nombre o la empresa de la firma.');
 if(s.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.email))throw Error('Revisa el correo de la firma.');
 if(s.website){let url:URL;try{url=new URL(s.website);}catch{throw Error('La web de la firma debe comenzar por https:// o http://.');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('La web de la firma debe comenzar por https:// o http://.');if(url.href.length>240)throw Error('La web de la firma es demasiado larga.');s.website=url.href;}
 if(!signatureColors.includes(s.color as typeof signatureColors[number]))throw Error('Elige uno de los colores de firma disponibles.');
 return s;
}
export function storedSignature(value:string|undefined):MailSignature|null{try{return normalizeSignature(JSON.parse(value||'null'));}catch{return null;}}
export const signatureLines=(s:MailSignature)=>[s.name,s.role,s.organization,s.location,s.email,s.phone,s.website].filter(Boolean);

// Old messages retain their exact saved body. Only their existing closing block
// is presented as a signature; unmatched lines are kept in the signature too.
export function signedContent(m:Pick<MailMessage,'body'|'signature'>){
 const s=m.signature;if(!s)return {body:m.body,extraLines:[] as string[]};
 const body=m.body.replace(/\r\n?/g,'\n'),blocks=body.split('\n\n'),tail=blocks.at(-1)||'',lines=tail.split('\n').map(l=>l.trim()).filter(Boolean);
 const norm=(v:string)=>v.toLocaleLowerCase('es').trim();
 const identities=[s.name,s.organization].filter(Boolean).map(norm);
 if(blocks.length<2||lines.length>12||tail.length>900||!identities.includes(norm(lines[0]||''))||!s.email||!lines.some(l=>norm(l)===norm(s.email)))return {body:m.body,extraLines:[] as string[]};
 const known=signatureLines(s).map(norm);
 return {body:blocks.slice(0,-1).join('\n\n'),extraLines:lines.filter(l=>!known.includes(norm(l)))};
}
export function signedText(m:Pick<MailMessage,'body'|'signature'>){const content=signedContent(m);return m.signature?[content.body,[...signatureLines(m.signature),...content.extraLines].join('\n')].join('\n\n'):m.body;}
