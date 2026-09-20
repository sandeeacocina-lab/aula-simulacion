import {pdfFromStreams} from './tributaria/receipt';
import {pdfFonts} from './tributaria/pdf-fonts';
import {sepeDate,type SepeReceipt} from './sepe-types';
const clean=(s:string)=>s.replace(/[–—−]/g,'-').replace(/€/g,'EUR').replace(/[^\x20-\xFF]/g,'?');
const escape=(s:string)=>clean(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const width=(s:string,size:number,bold=false)=>Array.from(clean(s)).reduce((n,c)=>n+(pdfFonts[bold?1:0].widths[c.charCodeAt(0)-32]||600),0)*size/1000;
export function sepeReceiptPDF(r:SepeReceipt){
 let out='';const pages:string[]=[];
 const text=(s:string,x:number,y:number,size=10,bold=false,color='0.12 0.22 0.32')=>{out+=`BT /F${bold?2:1} ${size} Tf ${color} rg 1 0 0 1 ${x} ${842-y} Tm (${escape(s)}) Tj ET\n`;};
 const rule=(y:number)=>{out+=`q 0.68 0.74 0.8 RG 0.6 w 40 ${842-y} m 555 ${842-y} l S Q\n`;};
 const fill=(y:number,h:number)=>{out+=`q 0.94 0.96 0.98 rg 40 ${842-y-h} 515 ${h} re f Q\n`;};
 const wrap=(value:string,max:number,size=10,bold=false)=>{const lines:string[]=[];let row='';for(const token of value.split(/\s+/)){let word=token;while(width(word,size,bold)>max){if(row){lines.push(row);row='';}let i=1;while(i<word.length&&width(word.slice(0,i+1),size,bold)<=max)i++;lines.push(word.slice(0,i));word=word.slice(i);}if(width(row+' '+word,size,bold)>max&&row){lines.push(row);row=word;}else row+=(row?' ':'')+word;}if(row)lines.push(row);return lines.length?lines:['—'];};
 const lines=(value:string,x:number,y:number,max:number,size=10,bold=false)=>{const rows=wrap(value,max,size,bold);rows.forEach((s,i)=>text(s,x,y+i*14,size,bold));return y+(rows.length-1)*14;};
 const header=()=>{out+='q 31 0 0 33 40 764 cm /Crest Do Q\n';text('SERVICIO PÚBLICO',84,53,11,true);text('DE EMPLEO ESTATAL',84,69,11,true);text('CONTRAT@',435,57,18,true,'0.08 0.27 0.44');text('Comunicación de contratos',427,74,8);rule(94);text('JUSTIFICANTE DE PRESENTACIÓN',40,124,16,true);text('Comunicación de la contratación laboral',40,146,10);};
 const finish=()=>{rule(773);text('SIMULACIÓN EDUCATIVA · SIN VALIDEZ ADMINISTRATIVA',40,790,8,true);text(r.batch.reference,40,806,8);text('Página '+(pages.length+1),507,806,8);pages.push(out);out='';};
 header();fill(167,79);text('REFERENCIA DE COMUNICACIÓN',51,185,8,true);text(r.batch.reference,51,204,11,true);text('Fecha de comunicación: '+sepeDate(r.batch.communicationDate),51,225,9);text('Contratos registrados: '+r.batch.count,340,225,9);text('Registro (Madrid): '+new Date(r.batch.createdAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid',hour12:false}),51,240,8);
 let y=270;text('Fichero presentado',40,y,8);y=lines(r.batch.filename,40,y+16,515,10,true)+23;fill(y-12,25);text('RELACIÓN DE CONTRATOS COMUNICADOS',50,y+4,9,true);y+=33;
 for(const c of r.contracts){
  const fields=[['Identificación de la persona',c.personId],['Modalidad de contrato',c.code],['NIF de la empresa',c.employerId],['Cuenta de cotización',c.ccc],['Inicio del contrato',sepeDate(c.startDate)],['Fin comunicado',c.endDate?sepeDate(c.endDate):'No consta']];
  const fieldRows=fields.map(([,value])=>wrap(value,155,9,true)),rowHeights=[0,1].map(row=>36+(Math.max(...fieldRows.slice(row*3,row*3+3).map(rows=>rows.length))-1)*14);
  const nameRows=wrap(c.name,415,10,true),height=42+(nameRows.length-1)*14+rowHeights[0]+rowHeights[1];if(y+height>748){finish();header();text('Relación de contratos · continuación',40,174,10,true);y=200;}fill(y-12,24+(nameRows.length-1)*14);text(String(c.line).padStart(2,'0'),50,y+3,9,true);nameRows.forEach((s,i)=>text(s,78,y+3+i*14,10,true));y+=32+(nameRows.length-1)*14;
  for(let row=0;row<2;row++){for(let col=0;col<3;col++){const index=row*3+col;text(fields[index][0],50+col*170,y,7.5);fieldRows[index].forEach((value,i)=>text(value,50+col*170,y+15+i*14,9,true));}y+=rowHeights[row];}y+=10;
 }
 const note='Los datos comunicados están disponibles en el expediente. Descargue este justificante para conservar la evidencia.'+(r.batch.warnings.length?' Las observaciones aceptadas están disponibles en la consulta.':'');const notes=wrap(note,500,9);if(y+notes.length*14+25>749){finish();header();y=186;}rule(y);lines(note,47,y+23,500,9);finish();return pdfFromStreams(pages);
}
export function sepePdfResponse(r:SepeReceipt){return new Response(sepeReceiptPDF(r) as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+r.batch.reference+'.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}
