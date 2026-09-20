import {companyProfile} from './company-server';
import {pdfFromStreams} from './tributaria/receipt';
import {pdfFonts} from './tributaria/pdf-fonts';
import {registerDate,type ReceiptSummary} from './social-receipt-data';
import {socialDate} from './social-types';
const safe=(s:string)=>s.replace(/[–—−]/g,'-').replace(/€/g,'EUR').replace(/[^\x20-\xFF]/g,'?');
const escape=(s:string)=>safe(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const width=(s:string,size:number,bold=false)=>Array.from(safe(s)).reduce((n,c)=>n+(pdfFonts[bold?1:0].widths[c.charCodeAt(0)-32]||600),0)*size/1000;
export function socialReceiptPDF(r:ReceiptSummary):Uint8Array{
 let out='';const pages:string[]=[];
 const text=(s:string,x:number,y:number,size=10,bold=false,color='0.12 0.20 0.25')=>{out+=`BT /F${bold?2:1} ${size} Tf ${color} rg 1 0 0 1 ${x} ${842-y} Tm (${escape(s)}) Tj ET\n`;};
 const line=(y:number)=>{out+=`q 0.72 0.78 0.8 RG 0.6 w 40 ${842-y} m 555 ${842-y} l S Q\n`;};
 const fill=(y:number,h:number)=>{out+=`q 0.94 0.96 0.97 rg 40 ${842-y-h} 515 ${h} re f Q\n`;};
 const wrap=(s:string,x:number,y:number,max:number,size=10,bold=false)=>{let row='';const words=s.split(/\s+/);for(const word of words){let wordLeft=word;while(width(wordLeft,size,bold)>max){if(row){text(row,x,y,size,bold);y+=14;row='';}let n=1;while(n<wordLeft.length&&width(wordLeft.slice(0,n+1),size,bold)<=max)n++;text(wordLeft.slice(0,n),x,y,size,bold);y+=14;wordLeft=wordLeft.slice(n);}if(width(row+' '+wordLeft,size,bold)>max&&row){text(row,x,y,size,bold);y+=14;row=wordLeft;}else row+=(row?' ':'')+wordLeft;}if(row)text(row,x,y,size,bold);return y;};
 const header=()=>{out+='q 32 0 0 34 40 765 cm /Crest Do Q\n';text('TESORERÍA GENERAL',85,53,11,true);text('DE LA SEGURIDAD SOCIAL',85,70,11,true);text('SIMULACIÓN EDUCATIVA',390,52,8,true,'0.46 0.27 0.08');text('Sin validez administrativa',390,68,8);line(93);text(r.title.toUpperCase(),40,125,17,true);wrap(r.subtitle,40,147,515,10);};
 const finish=()=>{line(773);text('SIMULACIÓN EDUCATIVA · SIN VALIDEZ ADMINISTRATIVA',40,790,8,true);text(companyProfile().shortName+' · '+r.reference,40,805,7);text('Página '+(pages.length+1),506,805,8);pages.push(out);out='';};
 header();fill(169,70);text('REFERENCIA DE REGISTRO',51,187,8,true);text(r.reference,51,204,11,true);text('Fecha de presentación: '+socialDate(r.date),51,224,9);text('Registro: '+registerDate(r.createdAt)+' (Madrid)',287,224,8);let y=266;
 for(const section of r.sections){if(y>675){finish();header();y=179;}fill(y-14,25);text(section.title.toUpperCase(),50,y+2,9,true);y+=31;for(let i=0;i<section.fields.length;i+=2){if(y>707){finish();header();y=181;}let end=y;for(let j=0;j<2;j++){const field=section.fields[i+j];if(!field)continue;const x=50+j*258;text(field[0],x,y,8,false,'0.35 0.4 0.44');end=Math.max(end,wrap(field[1],x,y+15,238,10,true));}y=end+23;}y+=5;}
 if(y>696){finish();header();y=183;}line(y);wrap(r.note,50,y+23,493,9);finish();return pdfFromStreams(pages);
}
export function socialPdfResponse(r:ReceiptSummary){return new Response(socialReceiptPDF(r) as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+r.reference+'.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}
