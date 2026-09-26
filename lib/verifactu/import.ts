import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {blankInvoice,digest,fullNumber,lineAmount,round,totals,type Invoice} from './model';
import type {Profile} from '../local/profile';
export type Word={text:string;x:number;y:number};
export function linkRectification(imported:Invoice,original:Invoice):Invoice{
 if(imported.type==='F1')throw Error('El documento seleccionado es una factura ordinaria. Selecciona el PDF de la rectificativa.');
 if(compact(imported.issuer.nif)!==compact(original.issuer.nif)||compact(imported.customer.nif)!==compact(original.customer.nif))throw Error('El emisor y el cliente del PDF deben coincidir con los de la factura original.');
 const reference=fullNumber(original);
 if(imported.original.trim()&&compact(imported.original)!==compact(reference))throw Error(`El PDF indica que rectifica ${imported.original}. Comprueba que has abierto la factura original correcta.`);
 const invoice=structuredClone(imported);invoice.original=reference;invoice.reviewed=false;
 const note=`Rectificativa vinculada a ${reference}. Revisa el motivo, los importes, las fechas y la numeración de Aplifisa.`;
 if(!invoice.importWarnings.includes(note))invoice.importWarnings.push(note);
 return invoice;
}
const compact=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f\s]/g,'').toUpperCase();
const number=(s:string)=>Number(s.replace(/\./g,'').replace(',','.'));
const dates=(s:string)=>/^\d{2}\/\d{2}\/\d{4}$/.test(s)?s.split('/').reverse().join('-'):'';
const numbers=(s:string)=>[...s.matchAll(/-?\d[\d.]*,\d+/g)].map(m=>number(m[0]));
export function parseAplifisa(pages:Word[][],profile:Profile,name:string):Invoice[]{
 if(!pages.length||pages.length>100)throw Error('Utiliza un PDF con entre 1 y 100 páginas.');
 return pages.map((p,index)=>{
 const has=(text:string)=>p.some(w=>compact(w.text)===text);
 if(!has('NUMEROFACTURA')||!has('CLIENTE')||!has('TOTALFACTURA'))throw Error(`No se reconoce la factura de la página ${index+1}. Utiliza el formato formativo de Aplifisa con texto seleccionable.`);
 const pick=(x1:number,x2:number,y:number,tol=3)=>p.filter(w=>w.x>=x1&&w.x<x2&&Math.abs(w.y-y)<=tol).sort((a,b)=>a.x-b.x).map(w=>w.text.trim()).join(' ').trim();
 const sheet=pick(220,280,208);if(sheet&&!/^1\s*de\s*1$/i.test(sheet))throw Error('Por ahora se admite una factura completa por página. Las facturas de varias páginas deben introducirse manualmente.');
 const i=blankInvoice(profile);i.sourceName=name;i.sourcePage=index+1;i.issuer={name:pick(30,280,51),nif:pick(30,200,67),address:[pick(30,280,81),pick(30,280,95)].filter(Boolean).join('\n'),contact:pick(30,280,124).replace(/^Tfno\s*:\s*/,'')};
 if(compact(i.issuer.nif)!==compact(profile.nif))throw Error(`El NIF emisor de la página ${index+1} no corresponde a ${profile.shortName}. Cambia a la empresa correcta antes de importar.`);
 i.customer={name:pick(280,590,173),nif:pick(130,215,244),address:[pick(280,590,203),pick(280,590,217)].filter(Boolean).join('\n'),contact:''};
 i.date=dates(pick(130,215,208));i.dueDate=dates(pick(220,285,244));i.payment=pick(115,360,750);i.notes=pick(115,590,263);
 const printed=pick(30,130,244),parts=printed.match(/^(.+?)\/(\d+)$/);
 if(parts){i.series=parts[1];i.number=parts[2];}else{i.number='';i.importWarnings.push('El PDF no incluye un número utilizable. Confirma la serie y el número de factura; no se deducen del pedido o albarán.');}
 const total=p.find(w=>/EUR/.test(w.text)&&w.y>700);if(!total)throw Error(`Falta el total de la página ${index+1}.`);i.sourceTotal=numbers(total.text)[0];
 if(!Number.isFinite(i.sourceTotal))throw Error('No se reconoce el total del PDF.');
 i.taxes=[];
 const taxYs=[...new Set(p.filter(w=>w.y>665&&w.y<715&&w.x<110&&numbers(w.text).length).map(w=>Math.round(w.y)))];
 for(const y of taxYs){const row=pick(30,325,y),n=numbers(row);if(n.length!==4&&n.length!==5)throw Error(`No se reconoce el desglose de IVA de la página ${index+1}.`);
  const [gross,discount,base,rate,quota]=n.length===4?[n[0],0,n[1],n[2],n[3]]:n;
  if(Math.abs(round(gross-discount)-base)>.02)throw Error('El descuento y la base del PDF no coinciden.');
  i.taxes.push({gross,discount,rate,quota});
  if(p.some(w=>w.x>=325&&w.x<475&&Math.abs(w.y-y)<3&&numbers(w.text).some(v=>v!==0)))throw Error('El PDF incluye recargo o retenciones. Esta primera versión admite IVA sin recargo ni retención.');
 }
 i.lines=[];const lineYs=[...new Set(p.filter(w=>w.x<80&&w.y>290&&w.y<635&&w.text.trim()).map(w=>Math.round(w.y)))];
 for(let n=0;n<lineYs.length;n++){
  const y=lineYs[n],next=lineYs[n+1]??635;const description=p.filter(w=>w.x>=85&&w.x<240&&w.y>=y-2&&w.y<Math.min(next-2,y+28)).sort((a,b)=>a.y-b.y||a.x-b.x).map(w=>w.text).join(' ');
  const quantity=numbers(pick(280,330,y))[0],price=numbers(pick(380,435,y))[0],discount=numbers(pick(435,480,y))[0]||0,amount=numbers(pick(490,590,y))[0];
  if(!description||![quantity,price,amount].every(Number.isFinite))throw Error(`No se reconoce una línea de la página ${index+1}.`);
  const line={code:pick(30,85,y),description,quantity,price,discount};if(Math.abs(lineAmount(line)-amount)>.02)throw Error(`La línea ${line.code} no coincide con el importe del PDF. Revisa su formato.`);i.lines.push(line);
 }
 if(!i.lines.length||!i.taxes.length||Math.abs(totals(i).total-i.sourceTotal)>.02||Math.abs(totals(i).lines-totals(i).gross)>.02)throw Error(`Los importes extraídos de la página ${index+1} no coinciden con el PDF. No se importa el lote.`);
 if(i.sourceTotal<0||p.some(w=>compact(w.text).includes('FRA.QUERECTIFICA'))){i.type='R1';i.series='R'+(i.date.slice(2,4)||'26');i.original=pick(455,590,750);i.reason=i.notes;i.importWarnings.push('Confirma el tipo y motivo de rectificación, las fechas y la factura o periodo rectificado.');}
 const references=p.filter(w=>/^(Albarán|Pedido)/i.test(w.text)).map(w=>w.text);i.notes=[i.notes,...references].filter(Boolean).join('\n');
 for(const r of references){const date=r.match(/\d{2}\/\d{2}\/\d{4}/)?.[0];if(date&&dates(date)>i.date)i.importWarnings.push('Revisa las fechas: hay un pedido o albarán posterior a la fecha de factura.');}
 i.importWarnings.push('Se conservan los importes y las fechas del PDF. La comprobación aritmética no determina el tratamiento fiscal correcto.');
 return i;
 });
}
export async function importAplifisa(file:File,profile:Profile){
 if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024||file.size===0)throw Error('Selecciona un PDF de Aplifisa de hasta 10 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=pdfWorker;
 const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false});try{
 const doc=await task.promise;if(doc.numPages>100)throw Error('El límite es de 100 páginas por PDF.');const pages:Word[][]=[];
 for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent();if(Math.abs(page.view[2]-595)>5||Math.abs(page.view[3]-841)>5)throw Error('Se requiere el formato A4 vertical de Aplifisa.');pages.push(content.items.flatMap(w=>'str'in w?[{text:w.str,x:w.transform[4],y:page.view[3]-w.transform[5]}]:[]));}
 return {invoices:parseAplifisa(pages,profile,file.name),bytes,fingerprint:digest(bytes)};
 }finally{await task.destroy();}
}
