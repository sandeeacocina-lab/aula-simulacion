import {mailPdfFonts} from './mail-pdf-fonts';
import {profileMailLogo,signatureMailLogo} from './select-mail-logo';
import {signedContent} from './mail-signature';
import {companies,validCompany} from './companies';
import {type MailMessage} from './mail-types';
import {fileSize} from './mail-files';

type Font={name:string;data:string;length:number;bbox:number[];ascent:number;descent:number;glyphs:Partial<Record<string,number[]>>};
const fonts:Font[]=mailPdfFonts;
const color='0.20 0.16 0.12',muted='0.39 0.33 0.28';
export function mailPDF(m:MailMessage){
 const profile=companies[validCompany(m.companyId)?m.companyId:'demo'],mailLogo=profileMailLogo(profile),signatureLogo=m.signature?signatureMailLogo(m.signature):null;
 const rgb=(hex:string)=>[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)/255).toFixed(3)).join(' '),pink=rgb(profile.accent);
 const chars=new Map<string,number>(),pages:string[]=[];let stream='',y=108;
 const glyph=(c:string,bold=false)=>fonts[bold?1:0].glyphs[String(c.codePointAt(0))]||[0,600];
 const width=(s:string,size:number,bold=false)=>Array.from(s).reduce((n,c)=>n+glyph(c,bold)[1],0)*size/1000;
 const encode=(s:string)=>Array.from(s).map(c=>{if(!chars.has(c))chars.set(c,chars.size+1);return chars.get(c)!.toString(16).padStart(4,'0');}).join('');
 const text=(s:string,x:number,top:number,size=10,bold=false,ink=color)=>{stream+=`BT /F${bold?2:1} ${size} Tf ${ink} rg 1 0 0 1 ${x} ${842-top} Tm <${encode(s)}> Tj ET\n`;};
 const rule=(top:number)=>{stream+=`q 0.85 0.80 0.75 RG 0.6 w 44 ${842-top} m 551 ${842-top} l S Q\n`;};
 const header=()=>{if(mailLogo){const scale=Math.min(120/mailLogo.width,45/mailLogo.height),w=mailLogo.width*scale,h=mailLogo.height*scale;stream+=`q ${w} 0 0 ${h} 44 ${842-40-h} cm /Logo Do Q\n`;}else{let name=profile.shortName;while(width(name,12,true)>375)name=name.slice(0,-1);text(name,44,55,12,true,pink);}text('CORREO',455,55,12,true,pink);text(m.homeFolder==='sent'?'Enviado':m.homeFolder==='drafts'?'Borrador':'Recibido',455,73,9,false,muted);rule(89);y=113;};
 const finish=()=>{rule(776);text('Simulación educativa · '+profile.name,44,793,8,false,muted);text('Página '+(pages.length+1),500,793,8,false,muted);text('Referencia: '+m.id,44,808,7.5,false,muted);pages.push(stream);stream='';};
 const ensure=(height:number)=>{if(y+height>754){finish();header();}};
 const wrap=(s:string,max:number,size:number,bold:boolean)=>{
  const rows:string[]=[];let line='';
  for(const word of s.replace(/\t/g,'    ').split(/( +)/)){if(!word)continue;if(width(line+word,size,bold)<=max){line+=word;continue;}if(line.trim()){rows.push(line.trimEnd());line='';}for(const c of word.trimStart()){if(width(line+c,size,bold)>max&&line){rows.push(line);line='';}line+=c;}}
  rows.push(line.trimEnd());return rows;
 };
 const paragraph=(value:string,size=10,bold=false,ink=color,left=44,max=507)=>{for(const line of value.replace(/\r\n?/g,'\n').split('\n')){const rows=wrap(line,max,size,bold);if(rows.length<=4)ensure(rows.length*(size+5));for(const row of rows){ensure(size+5);text(row,left,y,size,bold,ink);y+=size+5;}}};
 header();paragraph(m.subject||'Sin asunto',17,true);y+=11;
 paragraph('De: '+m.senderName+' <'+m.senderAddress+'>',9.5);
 paragraph('Para: '+(m.recipient||'Sin destinatario'),9.5);
 paragraph('Fecha: '+new Date(m.createdAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid',hour12:false})+' (Madrid)',9.5);
 if(m.homeFolder==='drafts')paragraph('Borrador guardado: '+new Date(m.updatedAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid',hour12:false}),9.5);
 const content=signedContent(m);
 y+=12;ensure(35);rule(y);y+=25;paragraph(content.body||'Sin texto',10.5);y+=22;
 if(m.signature){
  const s=m.signature,ink=rgb(s.color),lines=[s.role,s.name?s.organization:'',s.location,...content.extraLines,s.email,s.phone,s.website].filter(Boolean);
  const height=35+(signatureLogo?55:0)+wrap(s.name||s.organization,507,12,true).length*17+lines.reduce((n,line)=>n+wrap(line,507,9.5,false).length*14.5,0);
  ensure(Math.min(height,640));rule(y);y+=24;
  if(signatureLogo){const scale=Math.min(130/signatureLogo.width,38/signatureLogo.height),w=signatureLogo.width*scale,h=signatureLogo.height*scale;stream+=`q ${w} 0 0 ${h} 44 ${842-y-h} cm /SignatureLogo Do Q\n`;y+=h+17;}
  paragraph(s.name||s.organization,12,true,ink);
  for(const line of lines)paragraph(line,9.5,false,muted);y+=17;
 }else if(m.source==='mail'){
  ensure(132);rule(y);y+=24;paragraph(m.senderName,12,true,pink);
  if(m.senderName!==profile.name)paragraph(profile.name,10,true);
  paragraph(profile.activity,9.5,false,muted);
  paragraph(profile.mailbox,9.5,false,muted);paragraph(profile.website,8.5,false,pink);y+=17;
 }
 if(m.attachments.length){ensure(62);rule(y);y+=24;paragraph('Archivos adjuntos ('+m.attachments.length+')',10,true);for(const a of m.attachments)paragraph(a.name+' · '+fileSize(a.size),9.5);y+=8;paragraph('El PDF recoge la relación de archivos. La copia EML incluye los adjuntos.',8.5,false,muted);}
 finish();
 const objects:string[]=[''];const add=(s:string)=>{objects.push(s);return objects.length-1;};
 const objStream=(data:string,extra='')=>`<< /Length ${data.length} ${extra} >>\nstream\n${data}\nendstream`;
 const catalog=add(''),root=add('');
 const hex16=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i).toString(16).padStart(4,'0')).join('');
 const entries=Array.from(chars);let cmap='/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /AulaUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n';
 for(let i=0;i<entries.length;i+=100){const batch=entries.slice(i,i+100);cmap+=batch.length+' beginbfchar\n'+batch.map(([c,id])=>`<${id.toString(16).padStart(4,'0')}> <${hex16(c)}>`).join('\n')+'\nendbfchar\n';}cmap+='endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';const unicode=add(objStream(cmap));
 const fontIds=fonts.map((font,index)=>{
  const file=add(objStream(atob(font.data),`/Filter /FlateDecode /Length1 ${font.length}`));
  const descriptor=add(`<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.ascent} /StemV 80 /FontFile2 ${file} 0 R >>`);
  let map='\0\0';for(const [c] of entries){const gid=glyph(c,!!index)[0];map+=String.fromCharCode(gid>>8,gid&255);}const cidMap=add(objStream(map));
  const cid=add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap ${cidMap} 0 R /W [1 [${entries.map(([c])=>glyph(c,!!index)[1]).join(' ')}]] >>`);
  return add(`<< /Type /Font /Subtype /Type0 /BaseFont /${font.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`);
 });
 const embeddedImage=(image:NonNullable<typeof mailLogo>)=>add(objStream(atob(image.data),`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`));
 const logo=mailLogo?embeddedImage(mailLogo):null,signatureImage=signatureLogo?embeddedImage(signatureLogo):null;
 const imageResources=[logo?`/Logo ${logo} 0 R`:'',signatureImage?`/SignatureLogo ${signatureImage} 0 R`:''].filter(Boolean).join(' ');
 const pageIds=pages.map(content=>{const ref=add(objStream(content));return add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontIds[0]} 0 R /F2 ${fontIds[1]} 0 R >> /XObject << ${imageResources} >> >> /Contents ${ref} 0 R >>`);});
 objects[catalog]=`<< /Type /Catalog /Pages ${root} 0 R >>`;objects[root]=`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
 let output='%PDF-1.7\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=output.length;output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}const xref=output.length;output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Uint8Array.from(output,c=>c.charCodeAt(0));
}
