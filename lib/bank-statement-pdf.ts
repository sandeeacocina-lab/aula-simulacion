import {pdfFromStreams} from './tributaria/receipt';
import {pdfFonts} from './tributaria/pdf-fonts';
import {dateLabel,kindNames,type BankAccount,type BankMovement} from './bank-types';

export type BankStatement={company:{name:string;nif:string};account:BankAccount;movements:BankMovement[];from:string;to:string;search:string;issuedAt?:Date};
const ink='0.09 0.24 0.31',muted='0.32 0.40 0.44',green='0.08 0.42 0.37';
const clean=(value:string)=>value.replace(/[–—−]/g,'-').replace(/€/g,'EUR').replace(/\s/g,' ').replace(/[^\x20-\xFF]/g,'?');
const escape=(value:string)=>clean(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const amount=(cents:number)=>(cents/100).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const width=(value:string,size:number,bold=false)=>Array.from(clean(value)).reduce((sum,char)=>sum+(pdfFonts[bold?1:0].widths[char.charCodeAt(0)-32]||600),0)*size/1000;
function wrap(value:string,max:number,size=8.5,bold=false){
 const lines:string[]=[];let line='';
 for(const word of clean(value).split(/( +)/)){
  if(width(line+word,size,bold)<=max){line+=word;continue;}
  if(line.trim()){lines.push(line.trimEnd());line='';}
  for(const char of word.trimStart()){if(line&&width(line+char,size,bold)>max){lines.push(line);line='';}line+=char;}
 }
 if(line.trim())lines.push(line.trimEnd());return lines.length?lines:[''];
}
export function bankStatementPDF(statement:BankStatement):Uint8Array{
 const {company,account,movements,from,to,search}=statement,pages:string[]=[];
 const issued=(statement.issuedAt||new Date()).toLocaleString('es-ES',{timeZone:'Europe/Madrid',hour12:false});
 const credits=movements.reduce((sum,row)=>sum+Math.max(0,row.delta),0),debits=movements.reduce((sum,row)=>sum+Math.max(0,-row.delta),0);
 const period=from||to?`Periodo: ${from?dateLabel(from):'Desde el inicio'} - ${to?dateLabel(to):'Hasta el final'}`:'Periodo: Todos los movimientos';
 let stream='',y=0;
 const text=(value:string,x:number,top:number,size=9,bold=false,color=ink)=>{stream+=`BT /F${bold?2:1} ${size} Tf ${color} rg 1 0 0 1 ${x} ${595-top} Tm (${escape(value)}) Tj ET\n`;};
 const right=(value:string,x:number,top:number,size=9,bold=false,color=ink)=>text(value,x-width(value,size,bold),top,size,bold,color);
 const fill=(x:number,top:number,w:number,h:number,color:string)=>{stream+=`q ${color} rg ${x} ${595-top-h} ${w} ${h} re f Q\n`;};
 const line=(top:number)=>{stream+=`q 0.82 0.87 0.89 RG 0.5 w 40 ${595-top} m 802 ${595-top} l S Q\n`;};
 const finish=()=>{pages.push(stream);stream='';};
 const header=(first:boolean)=>{
  text('nexo.',40,48,27,true);text('BANCA DE EMPRESAS',41,64,7.5,true,muted);
  right('EXTRACTO DE CUENTA',802,44,18,true);right('SIMULACIÓN EDUCATIVA',802,62,8,true,muted);line(77);
  let top=99;
  for(const row of wrap(company.name,570,11,true)){text(row,40,top,11,true);top+=14;}
  text('NIF: '+company.nif,40,top+2,8.5);text('IBAN: '+(account.iban||'No indicado'),205,top+2,8.5);top+=23;
  text(period,40,top,8.5);right('Emitido: '+issued,802,top,7.5,false,muted);top+=16;
  if(search){for(const row of wrap('Búsqueda: '+search,762,8)){text(row,40,top,8);top+=11;}top+=5;}
  text('Fecha de contabilización ascendente · '+movements.length+(movements.length===1?' movimiento':' movimientos')+' · Importes en EUR',40,top,8,false,muted);top+=14;
  if(first){
   fill(40,top,762,48,'0.94 0.97 0.97');
   [['Entradas de la consulta',credits],['Salidas de la consulta',debits],['Saldo actual de la cuenta',account.balance]].forEach(([label,value],index)=>{text(String(label),52+index*254,top+16,8,false,muted);text(amount(Number(value)),52+index*254,top+36,13,true);});top+=63;
  }
  fill(40,top,762,24,ink);text('FECHA',48,top+16,8,true,'1 1 1');text('MOVIMIENTO / REFERENCIA',113,top+16,8,true,'1 1 1');right('ENTRADA',602,top+16,8,true,'1 1 1');right('SALIDA',697,top+16,8,true,'1 1 1');right('SALDO',794,top+16,8,true,'1 1 1');
  y=top+24;
 };
 header(true);
 if(!movements.length){text('No hay movimientos para los filtros seleccionados.',52,y+29,10);y+=49;}
 for(const [index,row] of movements.entries()){
  const name=wrap(row.name,389,9,true),concept=wrap(row.concept||kindNames[row.kind],389,8.5),reference=wrap('Registro '+row.id+(row.reference?' · Ref.: '+row.reference:'')+(row.iban?' · IBAN: '+row.iban:''),389,7.5);
  const height=12+name.length*12+concept.length*11+reference.length*10+8;
  if(y+height>512){finish();header(false);}
  if(index%2===0)fill(40,y,762,height,'0.97 0.98 0.99');
  const baseline=y+18;text(dateLabel(row.bookingDate),48,baseline,8.5);
  let top=y+16;for(const value of name){text(value,113,top,9,true);top+=12;}for(const value of concept){text(value,113,top,8.5);top+=11;}for(const value of reference){text(value,113,top,7.5,false,muted);top+=10;}
  right(row.delta>0?amount(row.delta):'-',602,baseline,9,false,row.delta>0?green:muted);right(row.delta<0?amount(-row.delta):'-',697,baseline,9);right(amount(row.balance),794,baseline,9,true);
  y+=height;line(y);
 }
 finish();
 const streams=pages.map((page,index)=>{
  stream=page;line(534);text('SIMULACIÓN EDUCATIVA · SIN VALIDEZ BANCARIA · SIN MOVIMIENTOS DE DINERO REAL',40,550,7.5,true,muted);right('Página '+(index+1)+' de '+pages.length,802,550,8,false,muted);
  text('Autoría y dirección pedagógica: Sandra Mangas. Desarrollo con asistencia de inteligencia artificial.',40,567,7,false,muted);return stream;
 });
 return pdfFromStreams(streams,{width:842,height:595});
}
