import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=pdfWorker;
import {SocialError,type SocialDocument,type SocialHeader,type SocialLine,type SocialAmount} from './social-types';

export type PdfSpan={text:string;x:number;y:number};
export type SocialPage={width:number;height:number;items:PdfSpan[]};
export const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const fail=(s:string):never=>{throw new SocialError(s);};
function money(s:string){s=s.replace(/\s/g,'').replace(/\u2212/g,'-');if(!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(s))return fail('Hay un importe ausente o ilegible en el PDF. No se ha registrado el documento.');const n=Math.round(Number(s.replaceAll('.','').replace(',','.'))*100);if(!Number.isSafeInteger(n)||Math.abs(n)>10_000_000_000)return fail('El importe supera el límite de la simulación.');return n;}
export function socialValidDate(s:unknown){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1900-01-01'||s>'2199-12-31')return fail('La fecha no es válida.');const d=new Date(s+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)return fail('La fecha no es válida.');return s;}
function date(s:string){if(!/^\d{2}\/\d{2}\/\d{4}$/.test(s))return fail('No se puede leer una fecha del documento.');return socialValidDate(s.split('/').reverse().join('-'));}
function period(s:string){const m=s.replace(/\s/g,'').match(/^(\d{2})\/(\d{4})-(\d{2})\/(\d{4})$/);if(!m)return fail('No se reconoce el periodo de liquidación.');const from=m[2]+'-'+m[1],to=m[4]+'-'+m[3];socialValidDate(from+'-01');socialValidDate(to+'-01');if(from>to)return fail('El periodo de liquidación está invertido.');return [from,to];}
const at=(p:PdfSpan[],x1:number,x2:number,y:number)=>p.filter(w=>w.x>=x1&&w.x<x2&&Math.abs(w.y-y)<2).sort((a,b)=>a.x-b.x).map(w=>w.text.trim()).filter(Boolean).join(' ').trim();
const baselines=(p:PdfSpan[])=>p.map(w=>w.y).sort((a,b)=>a-b).filter((y,i,a)=>!i||y-a[i-1]>2);
function header(p:PdfSpan[],landscape:boolean):SocialHeader{
 const mid=landscape?424:301,left=landscape?145:137,right=landscape?552:420;
 const field=(label:string,col:'left'|'right',required=true)=>{const a=p.find(w=>normal(w.text)===label&&(col==='left'?w.x<100:w.x>mid-3&&w.x<mid+3));if(!a){if(required)return fail('No se reconoce la cabecera del PDF de NominaSOL.');return '';}return at(p,col==='left'?left:right,col==='left'?mid-2:1000,a.y);};
 const [periodFrom,periodTo]=period(field('PERIODO DE LIQUIDACION','left'));
 const h={company:field('RAZON SOCIAL','left'),ccc:field('CODIGO CUENTA COTIZACION','left').replace(/\s/g,''),employerId:field('CODIGO DE EMPRESARIO','right',false),periodFrom,periodTo,qualification:field('CALIFICADOR DE LIQUIDACION','left'),controlDate:field('FECHA DE CONTROL','left',false),liquidationNumber:field('NUMERO DE LIQUIDACION','right',false),workers:Number(field('NUMERO DE TRABAJADORES','right')),scope:field('LIQUIDACION','right'),entity:field('ENTIDAD AT/EP','right')};
 if(!h.company||h.company.length>160||!/^\d{11}(?:\d{3})?$/.test(h.ccc)||!/^L\d{2}(?:\s|$)/.test(h.qualification)||!Number.isInteger(h.workers)||h.workers<1||h.workers>500||normal(h.scope)!=='TOTAL')return fail('Faltan datos esenciales o no se reconoce una liquidación total: revise razón social, CCC, periodo y número de trabajadores.');
 if(h.controlDate)h.controlDate=date(h.controlDate);
 return h;
}
function sameHeader(a:SocialHeader,b:SocialHeader){const labels:Record<string,string>={company:'razón social',ccc:'CCC',periodFrom:'periodo',periodTo:'periodo',workers:'número de trabajadores'};for(const key of ['company','ccc','employerId','periodFrom','periodTo','qualification','controlDate','liquidationNumber','workers','scope','entity'] as const)if(normal(String(a[key]))!==normal(String(b[key])))return fail('Los documentos o páginas no corresponden a la misma liquidación ('+(labels[key]||key)+').');}
function amountMap(rows:SocialAmount[]){const map=new Map<string,number>();for(const r of rows)map.set(normal(r.description),(map.get(normal(r.description))||0)+r.amount);return map;}
function totalsMatch(rows:SocialLine[],totals:SocialAmount[]){const a=amountMap(rows.map(r=>({description:r.description,amount:r.amount,base:null}))),b=amountMap(totals);return a.size===b.size&&[...a].every(([k,v])=>v===b.get(k));}

export function parseSocialPages(pages:SocialPage[],filename:string,expectedCompany='Empresa de prácticas'):SocialDocument{
 if(!pages.length||pages.length>30)return fail('El PDF debe contener entre 1 y 30 páginas.');
 const normalizedPages=pages.map(p=>{const expected=p.width>p.height?841.9:595.3,scale=expected/p.width;return {landscape:p.width>p.height,items:p.items.map(w=>({...w,x:w.x*scale,y:w.y*scale})).filter(w=>w.text.trim())};});
 const first=normalizedPages[0],title=first.items.filter(w=>w.y<100).map(w=>normal(w.text)).join(' '),kind=title.includes('RELACION NOMINAL DE TRABAJADORES')?'RNT':title.includes('LIQUIDACION DE COTIZACIONES')?'RLC':null;
 if(!kind)return fail('No se reconoce una RNT o liquidación de cotizaciones de NominaSOL. Utilice el PDF original con texto seleccionable.');
 if((kind==='RNT')!==first.landscape)return fail('La distribución de este PDF aún no es compatible. No se ha registrado.');
 const h=header(first.items,first.landscape),lines:SocialLine[]=[],allTotals:SocialAmount[][]=[];let amounts:SocialAmount[]=[],total:number|null=null,person={naf:'',ipf:'',caf:''};
 for(const page of normalizedPages){
  if(page.landscape!==first.landscape)return fail('El PDF combina documentos distintos. Selecciónelos como archivos separados.');
  sameHeader(h,header(page.items,page.landscape));const p=page.items;
  const column=p.find(w=>normal(w.text)==='IMPORTE'&&w.y>220);
  if(!column)return fail('No se reconoce la tabla de importes del PDF.');
  if(kind==='RNT'){
   const sums=p.find(w=>normal(w.text)==='SUMA DE BASES'&&w.y>column.y),end=sums?.y||10000;
   const ys=baselines(p.filter(w=>w.y>column.y+5&&w.y<end-2&&w.x>=470));
   if(!ys.length)return fail('No se han podido extraer los tramos de los trabajadores.');
   for(const y of ys){
    const naf=at(p,15,98,y),ipf=at(p,98,174,y),caf=at(p,174,221,y);
    if(naf){if(!/^\d{12}$/.test(naf)||! /^[A-Za-z0-9-]{5,16}$/.test(ipf))return fail('Hay un NAF o identificador de trabajador ausente o ilegible.');person={naf,ipf,caf};}else if(ipf||caf)return fail('No se puede asociar un tramo a su trabajador.');
    const from=date(at(p,221,282,y)),to=date(at(p,282,340,y)),days=Number(at(p,340,385,y)),description=at(p,470,753,y);
    if(!person.naf||!description||from>to||from.slice(0,7)<h.periodFrom||to.slice(0,7)>h.periodTo||!Number.isInteger(days)||days<1||days>31)return fail('Un tramo contiene fechas, días o identificación incompletos o fuera del periodo de liquidación.');
    lines.push({...person,from,to,days,hours:at(p,385,425,y),extraHours:at(p,425,470,y),description,amount:money(at(p,753,842,y))});
   }
   if(sums){const totals:SocialAmount[]=[];for(const y of baselines(p.filter(w=>w.y>sums.y+5&&w.x>=15&&w.x<840))){for(const [min,max,value] of [[15,375,375],[425,775,775]]){const description=at(p,min,max,y),raw=at(p,value,min===15?425:842,y);if(description||raw){if(!description)return fail('Falta el concepto de un total de la RNT.');totals.push({description,amount:money(raw),base:null});}}}allTotals.push(totals);}
  }else{
   if(pages.length!==1)return fail('Cada liquidación RLC debe ocupar una página. Puede incluir varias liquidaciones con CCC o periodos distintos en el mismo PDF.');
   for(const y of baselines(p.filter(w=>w.y>column.y+5&&(w.x<425||w.x>=495)))){const description=at(p,15,425,y),base=at(p,425,495,y),raw=at(p,495,595.3,y);if(!description&&!raw)continue;const amount=money(raw),deduction=/^(BONIFICACION(?:ES)?|REDUCCION(?:ES)?|COMPENSACION(?:ES)?)(?:\s|$)/.test(normal(description));amounts.push({description,base:base?money(base):null,amount:deduction?-Math.abs(amount):amount});}
   const last=amounts.at(-1);if(!last||normal(last.description)!=='LIQUIDO DE TOTALES')return fail('No se ha encontrado el total final de la liquidación.');total=last.amount;
   let group=0,subtotals=0,subCount=0;
   for(const r of amounts.slice(0,-1)){if(!r.description)return fail('Falta la descripción de un importe.');if(normal(r.description).startsWith('LIQUIDO ')){if(group!==r.amount)return fail('Un subtotal de la liquidación no coincide con la suma de sus conceptos.');subtotals+=r.amount;group=0;subCount++;}else group+=r.amount;}
   if(!subCount||group!==0||subtotals!==total)return fail('Los importes de la liquidación no coinciden con el líquido total.');
  }
 }
 if(kind==='RNT'){
  if(lines.length>2000)return fail('El documento supera el límite de 2.000 líneas.');
  const ids=new Map<string,string>();for(const r of lines){const existing=ids.get(r.naf);if(existing&&normal(existing)!==normal(r.ipf))return fail('Un mismo NAF aparece con identificadores distintos.');ids.set(r.naf,r.ipf);}
  if(ids.size!==h.workers)return fail('El número de trabajadores extraído no coincide con la cabecera de la RNT.');
  const identities=lines.map(r=>[r.naf,r.from,r.to,normal(r.description)].join('|'));if(new Set(identities).size!==lines.length)return fail('La RNT contiene tramos duplicados.');
  const combined=allTotals.flat(),last=allTotals.at(-1)||[];amounts=totalsMatch(lines,combined)?[...amountMap(combined)].map(([key,amount])=>({description:combined.find(r=>normal(r.description)===key)!.description,amount,base:null})):totalsMatch(lines,last)?last:fail('Las bases y compensaciones extraídas no coinciden con los totales de la RNT.');
 }
 const warnings:string[]=[];
 if(!normal(h.company).includes(expectedCompany))warnings.push('La razón social del PDF es «'+h.company+'». Compruebe que corresponde al supuesto que está trabajando.');
 if(!h.employerId)warnings.push('El PDF no incluye código de empresario.');
 if(!h.liquidationNumber)warnings.push('El PDF no incluye número de liquidación.');
 return {kind,filename,header:h,lines,amounts,total,pages:pages.length,warnings};
}

export function compareSocialDocuments(documents:SocialDocument[]){
 if(!documents.length||documents.length>2||new Set(documents.map(d=>d.kind)).size!==documents.length)return fail('Seleccione una RNT, una liquidación o un documento de cada tipo.');
 if(documents.length===1)return;
 const rnt=documents.find(d=>d.kind==='RNT')!,rlc=documents.find(d=>d.kind==='RLC')!;sameHeader(rnt.header,rlc.header);
 const common=rnt.amounts.find(r=>normal(r.description)==='BASE DE CONTINGENCIAS COMUNES'),commonRlc=rlc.amounts.find(r=>normal(r.description)==='CONTINGENCIAS COMUNES');
 if(!common||!commonRlc||common.amount!==commonRlc.base)return fail('La base de contingencias comunes no coincide entre la RNT y la liquidación.');
 const professional=rnt.amounts.filter(r=>['BASE DE CONTINGENCIAS PROFESIONALES','BASE IT DE AT Y EP DE SITUACIONES ESPECIALES'].includes(normal(r.description))).reduce((n,r)=>n+r.amount,0);
 for(const r of rlc.amounts.filter(r=>['IT ACCIDENTES DE TRABAJO','IMS ACCIDENTES DE TRABAJO'].includes(normal(r.description))))if(r.base!==professional)return fail('La base de accidentes de trabajo no coincide entre la RNT y la liquidación.');
}
export const socialIdentity=(d:SocialDocument)=>[d.kind,d.header.ccc,d.header.periodFrom,d.header.periodTo,d.header.qualification.slice(0,3),d.header.controlDate,d.header.liquidationNumber].join('|');
export const liquidationIdentity=(d:SocialDocument)=>socialIdentity(d).split('|').slice(1).join('|');
export function liquidationSignature(d:SocialDocument){const common=d.amounts.find(r=>normal(r.description)===(d.kind==='RNT'?'BASE DE CONTINGENCIAS COMUNES':'CONTINGENCIAS COMUNES'));const base=d.kind==='RNT'?common?.amount:common?.base;if(base===undefined||base===null)return fail('No se reconoce la base de contingencias comunes.');const professional=d.kind==='RNT'?d.amounts.filter(r=>['BASE DE CONTINGENCIAS PROFESIONALES','BASE IT DE AT Y EP DE SITUACIONES ESPECIALES'].includes(normal(r.description))).reduce((n,r)=>n+r.amount,0):d.amounts.find(r=>normal(r.description)==='IT ACCIDENTES DE TRABAJO')?.base;if(professional===undefined||professional===null)return fail('No se reconoce la base de accidentes de trabajo.');return JSON.stringify([normal(d.header.company),normal(d.header.employerId),d.header.workers,normal(d.header.scope),normal(d.header.entity),base,professional]);}
export const canonicalSocial=(docs:SocialDocument[])=>JSON.stringify([...docs].sort((a,b)=>a.kind.localeCompare(b.kind)).map(({filename,warnings,pages,sourcePages,...data})=>data));

// A NominaSOL export can contain independent liquidations, one per CCC/period.
// Keep each liquidation separate so worker counts, totals and payments never mix.
export function parseSocialFilePages(pages:SocialPage[],filename:string,expectedCompany='Empresa de prácticas'):SocialDocument[]{
 if(!pages.length||pages.length>30)return fail('El PDF debe contener entre 1 y 30 páginas.');
 const groups=new Map<string,{pages:SocialPage[];sourcePages:number[]}>();
 const landscape=pages[0].width>pages[0].height;
 for(const [index,page] of pages.entries()){
  if((page.width>page.height)!==landscape)return fail('El PDF combina documentos distintos. Selecciónelos como archivos separados.');
  const scale=(landscape?841.9:595.3)/page.width,h=header(page.items.map(w=>({...w,x:w.x*scale,y:w.y*scale})),landscape);
  const key=JSON.stringify([h.ccc,h.periodFrom,h.periodTo,h.qualification.slice(0,3),h.controlDate,h.liquidationNumber]);
  const group=groups.get(key)||{pages:[],sourcePages:[]};group.pages.push(page);group.sourcePages.push(index+1);groups.set(key,group);
 }
 return [...groups.values()].map(group=>{const doc=parseSocialPages(group.pages,filename,expectedCompany);if(groups.size>1)doc.sourcePages=group.sourcePages;return doc;});
}

export async function extractSocialPdf(bytes:Uint8Array,filename:string,expectedCompany='Empresa de prácticas'):Promise<SocialDocument[]>{
 if(bytes.length>5*1024*1024||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return fail('Seleccione un PDF original de hasta 5 MB.');
 let pdf:Awaited<ReturnType<typeof getDocument>["promise"]>|undefined;
 try{
  const options={isEvalSupported:false,useSystemFonts:true,disableFontFace:true,useWasm:false,verbosity:0};
  pdf=await getDocument({data:bytes.slice(),...options}).promise;
  if(pdf.numPages>30)return fail('El PDF supera el límite de 30 páginas.');
  const pages:SocialPage[]=[];let count=0;
  for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();count+=content.items.length;if(count>40000)return fail('El documento contiene demasiado texto.');const items=content.items.flatMap(w=>'str'in w&&Math.abs(w.transform[1])+Math.abs(w.transform[2])<0.01?[{text:w.str,x:w.transform[4],y:page.view[3]-w.transform[5]}]:[]);pages.push({width:page.view[2],height:page.view[3],items});}
  return parseSocialFilePages(pages,filename,expectedCompany);
 }catch(e){if(e instanceof SocialError)throw e;return fail('No se puede leer este PDF. Compruebe que no esté protegido, dañado o escaneado y vuelva a exportarlo desde el programa.');}
 finally{await pdf?.loadingTask.destroy();}
}
