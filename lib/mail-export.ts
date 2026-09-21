import {type MailMessage} from './mail-types';
import {profileMailLogo,signatureMailLogo} from './select-mail-logo';
import {signedContent,signedText} from './mail-signature';
import {companies,validCompany} from './companies';

export type ExportAttachment={name:string;type:string;bytes:Uint8Array};
export function mailExportName(m:MailMessage,format:'pdf'|'eml'){
 const subject=(m.subject||'Sin asunto').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:"<>|?*\u202a-\u202e\u2066-\u2069]/g,'_').slice(0,75).trim();
 return `${m.createdAt.slice(0,10)}_${subject}_${m.id.slice(0,8)}.${format}`;
}
export function mailExportHeaders(m:MailMessage,format:'pdf'|'eml'){
 const filename=encodeURIComponent(mailExportName(m,format)).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return {'Content-Type':format==='pdf'?'application/pdf':'message/rfc822','Content-Disposition':`attachment; filename="correo.${format}"; filename*=UTF-8''${filename}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
}
function base64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
const utf8=(value:string)=>base64(new TextEncoder().encode(value));
const folded=(value:string)=>value.match(/.{1,76}/g)?.join('\r\n')||'';
const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const oneLine=(value:string)=>value.replace(/[\r\n\u0000-\u001f\u007f]/g,' ');
// Each encoded word stays below RFC 2047's 75-character limit, including UTF-8 names.
function headerText(value:string){const chunks:string[]=[];let chunk='';for(const char of oneLine(value)){if(new TextEncoder().encode(chunk+char).length>42){chunks.push(chunk);chunk='';}chunk+=char;}if(chunk)chunks.push(chunk);return chunks.map(s=>'=?UTF-8?B?'+utf8(s)+'?=').join('\r\n ');}

export function mailEML(m:MailMessage,attachments:ExportAttachment[]){
 const profile=companies[validCompany(m.companyId)?m.companyId:'demo'];
 const mailLogo=m.signature?signatureMailLogo(m.signature):m.source==='mail'?profileMailLogo(profile):null;
 const logoId=mailLogo?.id+'-logo@aula.test',content=signedContent(m);
 const mixed='aula_mixed_'+m.id,alternative='aula_alt_'+m.id,related='aula_related_'+m.id;
 const body=signedText(m).replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n');
 const plain=body+(m.source==='mail'&&!m.signature?'\r\n\r\n'+[m.senderName,...(m.senderName===profile.name?[]:[profile.name]),profile.activity,profile.mailbox,profile.website].filter(Boolean).join('\r\n'):'');
 const logoHtml=mailLogo?`<td style="padding-right:22px;vertical-align:middle"><img src="cid:${logoId}" width="130" alt="${html(m.signature?.organization||profile.name)}"></td>`:'';
 let signatureHtml=m.source==='mail'?`<table role="presentation" style="margin-top:28px;border-collapse:collapse"><tr>${logoHtml}<td style="border-left:3px solid ${profile.accent};padding-left:20px;font-size:14px;line-height:1.6"><strong style="color:${profile.accent};font-size:17px">${html(m.senderName)}</strong><br>${m.senderName===profile.name?'':html(profile.name)+'<br>'}${html(profile.activity)}<br>${html(profile.mailbox)}${profile.website?`<br><a href="${html(profile.website)}" style="color:${profile.accent}">Web de ${html(profile.shortName)}</a>`:''}</td></tr></table>`:'';
 if(m.signature){const s=m.signature;signatureHtml=`<table role="presentation" style="margin-top:28px;border-collapse:collapse"><tr>${logoHtml}<td style="border-left:3px solid ${s.color};padding-left:20px;font-size:14px;line-height:1.6"><strong style="color:${s.color};font-size:17px">${html(s.name||s.organization)}</strong>${[s.role,s.name?s.organization:'',s.location,...content.extraLines,s.email,s.phone].filter(Boolean).map(line=>'<br>'+html(line)).join('')}${s.website?`<br><a href="${html(s.website)}" style="color:${s.color}">${html(s.website)}</a>`:''}</td></tr></table>`;}
 const htmlBody=`<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#33291f;line-height:1.7"><div style="white-space:pre-wrap;overflow-wrap:anywhere">${html(content.body)}</div>${signatureHtml}</body></html>`;
 const lines=[`From: ${headerText(m.senderName)} <${oneLine(m.senderAddress)}>`,`To: ${oneLine(m.recipient)}`,`Subject: ${headerText(m.subject||'Sin asunto')}`,`Date: ${new Date(m.createdAt).toUTCString()}`,`Message-ID: <${m.id}@${profile.id}.test>`,'MIME-Version: 1.0','X-Central-Simulation: true',`X-Central-Folder: ${m.homeFolder}`,...(m.homeFolder==='drafts'?['X-Unsent: 1']:[]),...(m.replyTo?[`In-Reply-To: <${m.replyTo}@${profile.id}.test>`,`References: <${m.replyTo}@${profile.id}.test>`]:[]),`Content-Type: multipart/mixed; boundary="${mixed}"`,'',`--${mixed}`,`Content-Type: multipart/alternative; boundary="${alternative}"`,'',`--${alternative}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',folded(utf8(plain)),`--${alternative}`,`Content-Type: multipart/related; boundary="${related}"`,'',`--${related}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',folded(utf8(htmlBody))];
 if(mailLogo)lines.push(`--${related}`,'Content-Type: image/jpeg','Content-Transfer-Encoding: base64',`Content-ID: <${logoId}>`,`Content-Disposition: inline; filename="${mailLogo.id}-logo.jpg"`,'',folded(mailLogo.data));
 lines.push(`--${related}--`,`--${alternative}--`);
 for(const file of attachments){
  const encoded=Array.from(new TextEncoder().encode(file.name),b=>'%'+b.toString(16).padStart(2,'0').toUpperCase());
  const segments:string[]=[];for(let i=0;i<encoded.length;i+=18)segments.push(encoded.slice(i,i+18).join(''));
  lines.push(`--${mixed}`,`Content-Type: ${/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type)?file.type:'application/octet-stream'}`,'Content-Transfer-Encoding: base64','Content-Disposition: attachment;',...segments.map((s,i)=>` filename*${i}*=${i===0?"UTF-8''":''}${s}${i<segments.length-1?';':''}`),'',folded(base64(file.bytes)));
 }
 lines.push(`--${mixed}--`,'');return lines.join('\r\n');
}
