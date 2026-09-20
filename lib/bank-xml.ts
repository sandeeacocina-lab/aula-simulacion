import {XMLParser,XMLValidator} from 'fast-xml-parser';
import type {BankItem,BankParsed} from './bank-types';
export class BankError extends Error{status:number;batchId?:string;constructor(message:string,status=400,batchId?:string){super(message);this.status=status;this.batchId=batchId;}}
export function cents(value:unknown,label='el importe',zero=false){
 if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim()))throw new BankError('Revisa '+label+': debe ser un importe en euros con un máximo de dos decimales.');
 const [whole,decimal='']=value.trim().split('.');const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n>(100_000_000*100)||(!zero&&n<=0))throw new BankError('Revisa '+label+': el importe está fuera del límite de la simulación.');return n;
}
export function validDate(value:unknown,label='la fecha'){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2200-12-31'||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new BankError('Revisa '+label+'.');return value;
}
export function normalizeIban(value:string){return value.replace(/\s/g,'').toUpperCase();}
export function validIban(value:string){
 const v=normalizeIban(value);if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)||(v.startsWith('ES')&&v.length!==24))return false;
 let remainder=0;for(const c of v.slice(4)+v.slice(0,4)){const digits=/[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c;for(const d of digits)remainder=(remainder*10+Number(d))%97;}return remainder===1;
}
type Node=Record<string,any>;
const arr=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
function obj(v:any,label:string):Node{if(!v||typeof v!=='object'||Array.isArray(v))throw new BankError('Falta o se repite '+label+' en el XML.');return v;}
function value(v:any,label:string,required=true,max=240):string{if(v===undefined&&!required)return '';if(v&&typeof v==='object'&&!Array.isArray(v))v=v['#text'];if(typeof v!=='string'||(required&&!v.trim())||v.length>max)throw new BankError('Revisa '+label+' en el XML.');return v.trim();}
function totalCheck(node:Node,items:BankItem[],label:string,requireCount=false){
 if(node.NbOfTxs!==undefined||requireCount){const n=value(node.NbOfTxs,'el número de operaciones');if(!/^\d+$/.test(n)||Number(n)!==items.length)throw new BankError(label+': el número de operaciones declarado no coincide con el detalle.');}
 if(node.CtrlSum!==undefined&&cents(value(node.CtrlSum,'la suma de control'),'la suma de control',true)!==items.reduce((n,x)=>n+x.amount,0))throw new BankError(label+': la suma de control no coincide con los importes del detalle.');
}
export function parseBankXml(xml:string):BankParsed{
 if(typeof xml!=='string'||new TextEncoder().encode(xml).byteLength>1024*1024)throw new BankError('El XML no puede superar 1 MB.',413);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new BankError('El XML contiene declaraciones externas no admitidas.');
 const validation=XMLValidator.validate(xml);if(validation!==true)throw new BankError('El XML está incompleto o mal formado. Vuelve a exportarlo desde el programa.');
 const format=xml.match(/\bxmlns(?:\:[\w.-]+)?\s*=\s*["']urn:iso:std:iso:20022:tech:xsd:(pain\.\d{3}\.\d{3}\.\d{2})["']/)?.[1];
 if(!format||!['pain.001.001.03','pain.001.001.09','pain.008.001.02','pain.008.001.08'].includes(format))throw new BankError('Este archivo no es una remesa SEPA de transferencias, nóminas o recibos compatible.');
 const root=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,trimValues:true,ignoreDeclaration:true}).parse(xml);
 const doc=obj(root.Document,'Document'),collection=format.startsWith('pain.008');
 if(doc[collection?'CstmrCdtTrfInitn':'CstmrDrctDbtInitn'])throw new BankError('El XML mezcla cobros y transferencias. Exporta una remesa por separado.');
 const message=obj(doc[collection?'CstmrDrctDbtInitn':'CstmrCdtTrfInitn'],'el cuerpo de la remesa'),header=obj(message.GrpHdr,'la cabecera');
 const messageId=value(header.MsgId,'la referencia de la remesa',true,120),initiator=value(header.InitgPty?.Nm,'el ordenante',false);
 const items:BankItem[]=[],warnings=new Set<string>();
 const groups=arr(message.PmtInf);if(!groups.length||groups.length>200)throw new BankError('La remesa no contiene bloques de pago válidos.');
 for(const block of groups){
  const g=obj(block,'el bloque de pago');if(g.PmtMtd!==(collection?'DD':'TRF'))throw new BankError('El método de pago no coincide con el tipo de remesa.');
  if(g.PmtTpInf?.SvcLvl?.Cd&&g.PmtTpInf.SvcLvl.Cd!=='SEPA')throw new BankError('Solo se admiten remesas SEPA en euros.');
  const rawDate=collection?g.ReqdColltnDt:g.ReqdExctnDt;
  const requestedDate=validDate(typeof rawDate==='object'?rawDate?.Dt:rawDate,'la fecha de ejecución o cobro');
  const sourceName=value(g[collection?'Cdtr':'Dbtr']?.Nm,'la empresa titular'),sourceIban=normalizeIban(value(g[collection?'CdtrAcct':'DbtrAcct']?.Id?.IBAN,'la cuenta de la empresa'));
  if(!validIban(sourceIban))warnings.add('El IBAN de la empresa no supera la comprobación. Confirma que es una cuenta ficticia de prácticas.');
  const rows=arr(g[collection?'DrctDbtTxInf':'CdtTrfTxInf']);if(!rows.length||items.length+rows.length>200)throw new BankError('Cada remesa debe contener entre 1 y 200 operaciones.');
  const groupItems:BankItem[]=[];
  for(const raw of rows){
   const tx=obj(raw,'el detalle de la operación'),a=obj(collection?tx.InstdAmt:tx.Amt?.InstdAmt,'el importe');
   if(a['@_Ccy']!=='EUR')throw new BankError('Solo se admiten importes en EUR.');
   const amount=cents(value(a,'el importe')),name=value(tx[collection?'Dbtr':'Cdtr']?.Nm,'el nombre del destinatario o cliente');
   const iban=normalizeIban(value(tx[collection?'DbtrAcct':'CdtrAcct']?.Id?.IBAN,'el IBAN del destinatario o cliente'));
   if(!validIban(iban))warnings.add('Hay IBAN de destinatarios o clientes que no superan la comprobación. Revisa las cuentas ficticias.');
   const reference=value(tx.PmtId?.EndToEndId,'la referencia de la operación',true,120);
   const salary=!collection&&(g.PmtTpInf?.CtgyPurp?.Cd==='SALA'||tx.PmtTpInf?.CtgyPurp?.Cd==='SALA'||tx.Purp?.Cd==='SALA');
   const concept=arr(tx.RmtInf?.Ustrd).map(x=>value(x,'el concepto',false,500)).join(' · ')||value(tx.RmtInf?.Strd?.CdtrRefInf?.Ref,'la referencia del concepto',false)||(salary?'Abono de nómina':'');
   if(concept.length>1200)throw new BankError('El concepto de una operación es demasiado largo.');
   const mandateId=collection?value(tx.DrctDbtTx?.MndtRltdInf?.MndtId,'la referencia del mandato'):'';
   const mandateDate=collection?validDate(tx.DrctDbtTx?.MndtRltdInf?.DtOfSgntr,'la fecha de firma del mandato'):'';
   if(collection&&sourceIban===iban)warnings.add('La cuenta de un cliente coincide con la cuenta de cobro. Revisa los datos de la práctica.');
   groupItems.push({name,iban,amount,concept,reference,requestedDate,kind:collection?'collection':salary?'payroll':'payment',mandateId,mandateDate,sourceName,sourceIban});
  }
  totalCheck(g,groupItems,'Bloque de pago');items.push(...groupItems);
 }
 totalCheck(header,items,'Cabecera de la remesa',true);
 const references=items.map(x=>x.reference).filter(x=>x!=='NOTPROVIDED');if(new Set(references).size!==references.length)warnings.add('Hay referencias de operación repetidas dentro del archivo.');
 const total=items.reduce((n,x)=>n+x.amount,0);if(!Number.isSafeInteger(total)||total>100_000_000*100)throw new BankError('La remesa supera el límite de 100 millones de euros de la simulación.');
 return {format,messageId,initiator,kind:collection?'collection':items.every(x=>x.kind==='payroll')?'payroll':'payment',items,total,count:items.length,warnings:[...warnings]};
}
