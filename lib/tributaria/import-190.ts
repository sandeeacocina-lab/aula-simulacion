import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {blankReport,reportId,reportTotals,type Report} from './reports';
export type PdfWord={text:string;x:number;y:number};
export type Imported190={report:Report;warnings:string[]};
export function parseNominaSol190(pages:PdfWord[][]):Imported190{
 const pick=(p:PdfWord[],x1:number,x2:number,y:number,tol=5)=>p.filter(w=>w.x>=x1&&w.x<x2&&Math.abs(w.y-y)<tol).sort((a,b)=>a.x-b.x).map(w=>w.text.trim()).join(' ').trim();
 const p=pages[0]||[];
 // Coordinates are PDF text baselines, measured from the top of an A4 page.
 const header=p.find(w=>w.x>420&&w.x<480&&/^20\d\d$/.test(w.text.trim()));
 if(!header||pages.length<2||!p.map(w=>w.text).join('').replace(/\s/g,'').includes('VERSIÓNEDUCATIVA'))throw Error('No se reconoce el PDF educativo de NominaSOL. Use el borrador del modelo 190 con texto seleccionable, no una imagen escaneada.');
 const shift=header.y-113.7;
 const h=(a:number,b:number,y:number)=>pick(p,a,b,y+shift);
 const d=blankReport('190');d.year=header.text.trim();d.nif=h(25,130,132);d.company=h(25,430,155.4);d.contact='';d.phone='';
 const expected=Number(h(490,580,518.9));
 for(const page of pages.slice(1)){
  const anchors=page.filter(w=>w.x>25&&w.x<70&&w.y>110&&w.y<530&&/^[A-Z0-9-]{5,16}$/.test(w.text.trim()));
  for(const a of anchors){
   const at=(x1:number,x2:number,dy:number)=>pick(page,x1,x2,a.y+dy);
   const key=at(50,80,27.3);if(!['A','G','L'].includes(key))throw Error('El PDF contiene una clave no compatible ('+key+'). No se ha importado ningún registro.');
   const data:Record<string,string>={nif:a.text.trim(),name:at(180,510,0),province:at(530,570,0),key,subkey:at(125,165,27.3),gross:at(210,295,52.6),withheld:at(300,390,52.6),inKind:at(210,295,99.5),onAccount:at(300,390,99.5),passedOn:at(400,490,99.5),accrual:at(495,535,142),birth:at(25,80,213.2),family:at(85,120,213.2),spouse:at(120,220,213.2),disability:at(270,300,213.2),contract:at(310,345,213.2),expenses:at(170,230,245.1)};
   if(data.accrual==='0')data.accrual='';
   d.rows.push({id:reportId(),data});
  }
 }
 const number=(s:string)=>Number(s.replace(/\./g,'').replace(',','.'));
 const totals=reportTotals(d);
 if(!d.nif||!d.company||!expected||expected!==d.rows.length)throw Error('No coinciden los registros extraídos con el resumen del PDF. No se ha importado la declaración.');
 if(Math.abs(totals.total-number(h(490,590,543)))>0.02||Math.abs(totals.withheld-number(h(490,590,567.1)))>0.02)throw Error('Los importes extraídos no coinciden con los totales del PDF. No se ha importado la declaración.');
 return{report:d,warnings:['Revise todos los registros antes de presentar. Se importan identificación, claves, importes y datos personales básicos. Complete manualmente descendientes, ascendientes, reducciones, pensiones y demás datos adicionales del supuesto.','Complete la persona de contacto y el teléfono. Se conservan los valores del PDF, incluso si requieren corrección en el simulador.']};
}
export async function importNominaSol190(file:File):Promise<Imported190>{
 if(!/\.pdf$/i.test(file.name)||file.size>15*1024*1024)throw Error('Seleccione un PDF de NominaSOL de hasta 15 MB.');
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=pdfWorker;
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
 try{const doc=await task.promise;if(doc.numPages>300)throw Error('El PDF supera el límite de 300 páginas.');const pages:PdfWord[][]=[];
 for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();const height=page.view[3];pages.push(content.items.flatMap(item=>'str' in item?[{text:item.str,x:item.transform[4],y:height-item.transform[5]}]:[]));}
 return parseNominaSol190(pages);
 }finally{await task.destroy();}
}
