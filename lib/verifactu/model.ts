import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import type {Profile} from '../local/profile';
import {newMailId} from '../mail-types';
export type Party={name:string;nif:string;address:string;contact:string};
export type Line={code:string;description:string;quantity:number;price:number;discount:number};
export type Tax={gross:number;discount:number;rate:number;quota:number};
export type Invoice={id:string;brand:Profile;issuer:Party;customer:Party;series:string;number:string;date:string;operationDate:string;dueDate:string;type:'F1'|'R1'|'R2'|'R3'|'R4';original:string;reason:string;notes:string;payment:string;iban:string;lines:Line[];taxes:Tax[];sourceName:string;sourcePage:number;sourceTotal:number|null;importWarnings:string[];reviewed:boolean};
export type SavedInvoice={invoice:Invoice;state:'draft'|'issued';revision:number;sourceKey:string;createdAt:string};
export type RecordKind='alta'|'subsanacion'|'anulacion';
export type RecordStatus='Correcto'|'AceptadoConErrores'|'Incorrecto';
export type PracticeSignature={method:'certificado-practicas';holder:string;nif:string;certificate:string;conform:true};
export type RecordPayload={invoice:Invoice;kind:RecordKind;reason:string;previousHash:string;createdAt:string;rejectedBefore:boolean;signature?:PracticeSignature};
export type InvoiceRecord={seq:number;id:string;invoiceId:string;kind:RecordKind;previousHash:string;hash:string;createdAt:string;status:RecordStatus;message:string;payload:RecordPayload};
export type Scenario='normal'|'warning'|'rejected';
export const round=(v:number)=>Math.round((v+Math.sign(v||1)*1e-9)*100)/100;
export const money=(v:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(v);
export const lineAmount=(l:Line)=>round(l.quantity*l.price*(1-l.discount/100));
export const fullNumber=(i:Invoice)=>`${i.series.trim()}/${i.number.trim()}`;
export const isoDate=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'});
export const displayDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('/'):s;
export const uuid=newMailId;
export function practiceSignature(i:Invoice):PracticeSignature{return {method:'certificado-practicas',holder:i.issuer.name,nif:i.issuer.nif,certificate:'SIM-CERT-'+i.issuer.nif.toUpperCase(),conform:true};}
export function validateSignature(signature:unknown,i:Invoice):asserts signature is PracticeSignature{const s=signature as PracticeSignature,expected=practiceSignature(i);if(!s||s.method!==expected.method||s.holder!==expected.holder||s.nif!==expected.nif||s.certificate!==expected.certificate||s.conform!==true)throw Error('Selecciona el certificado de la empresa y confirma la firma simulada.');}
export const digest=(s:string|Uint8Array)=>bytesToHex(sha256(typeof s==='string'?new TextEncoder().encode(s):s)).toUpperCase();
// Deterministic educational chain. This is not a certified SIF/XML implementation.
export const recordHash=(p:RecordPayload)=>digest(JSON.stringify(p));
export function totals(i:Invoice){const gross=round(i.taxes.reduce((s,t)=>s+t.gross,0)),discount=round(i.taxes.reduce((s,t)=>s+t.discount,0)),base=round(gross-discount),vat=round(i.taxes.reduce((s,t)=>s+t.quota,0));return {gross,discount,base,vat,total:round(base+vat),lines:round(i.lines.reduce((s,l)=>s+lineAmount(l),0))};}
export function blankInvoice(p:Profile):Invoice{return {id:uuid(),brand:structuredClone(p),issuer:{name:p.legalName,nif:p.nif,address:'',contact:p.mailbox},customer:{name:'',nif:'',address:'',contact:''},series:'FV'+isoDate().slice(2,4),number:'',date:isoDate(),operationDate:'',dueDate:'',type:'F1',original:'',reason:'',notes:'',payment:'Transferencia bancaria',iban:p.iban,lines:[{code:'',description:'',quantity:1,price:0,discount:0}],taxes:[{gross:0,discount:0,rate:21,quota:0}],sourceName:'',sourcePage:0,sourceTotal:null,importWarnings:[],reviewed:false};}
export function validateShape(value:unknown):asserts value is Invoice {
 const i=value as Invoice;if(!i||typeof i!=='object'||!Array.isArray(i.lines)||!Array.isArray(i.taxes)||i.lines.length>150||i.taxes.length>15||!Array.isArray(i.importWarnings)||i.importWarnings.length>100)throw Error('Estructura de factura no válida.');
 const str=(v:unknown,n:number)=>typeof v==='string'&&v.length<=n&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
 for(const k of ['id','series','number','date','operationDate','dueDate','type','original','reason','notes','payment','iban','sourceName'] as const)if(!str(i[k],k==='notes'?6000:k==='reason'?2000:500))throw Error('Datos de factura no válidos: '+k);
 for(const p of [i.issuer,i.customer])if(!p||!str(p.name,150)||!str(p.nif,30)||!str(p.address,500)||!str(p.contact,250))throw Error('Datos del emisor o destinatario no válidos.');
 const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e10;
 for(const l of i.lines)if(!str(l.code,80)||!str(l.description,1000)||![l.quantity,l.price,l.discount].every(num))throw Error('Línea de factura no válida.');
 for(const t of i.taxes)if(![t.gross,t.discount,t.rate,t.quota].every(num))throw Error('Desglose de IVA no válido.');
 if(!['F1','R1','R2','R3','R4'].includes(i.type)||typeof i.reviewed!=='boolean'||!Number.isSafeInteger(i.sourcePage)||i.sourcePage<0||i.sourceTotal!==null&&!num(i.sourceTotal)||i.importWarnings.some(w=>!str(w,2000)))throw Error('Datos de factura no válidos.');
 if(!i.brand||!str(i.brand.legalName,150)||!str(i.brand.shortName,60)||!str(i.brand.logo,1000)||!/^#[a-f\d]{6}$/i.test(i.brand.accent))throw Error('Identidad de la factura no válida.');
}
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function invoiceErrors(i:Invoice){
 const e:string[]=[];try{validateShape(i);}catch(err){return [(err as Error).message];}
 if(!i.issuer.name.trim()||!i.issuer.nif.trim()||!i.issuer.address.trim())e.push('Completa el nombre, NIF y domicilio del emisor.');
 if(!i.customer.name.trim()||!i.customer.nif.trim()||!i.customer.address.trim())e.push('Completa el nombre, NIF y domicilio del cliente.');
 if(!/^[\p{L}\p{N}_.-]{1,30}$/u.test(i.series)||!/^\d{1,12}$/.test(i.number))e.push('Indica una serie sin espacios ni barras y un número de factura.');
 if(!validDate(i.date)||i.operationDate&&!validDate(i.operationDate)||i.dueDate&&!validDate(i.dueDate))e.push('Revisa las fechas de la factura.');
 if(!i.lines.length||i.lines.some(l=>!l.description.trim()||l.quantity===0||l.discount<0||l.discount>100))e.push('Completa los conceptos, cantidades y descuentos de las líneas.');
 if(!i.taxes.length||i.taxes.some(t=>t.rate<=0||t.rate>100||Math.abs(round((t.gross-t.discount)*t.rate/100)-t.quota)>.02))e.push('Revisa el desglose de IVA. Esta primera versión admite operaciones interiores sujetas a IVA.');
 if(i.taxes.some(t=>Math.abs(t.discount)>Math.abs(t.gross)||t.gross*t.discount<0))e.push('El descuento debe tener el signo de su importe previo y no superarlo.');
 const t=totals(i);if(Math.abs(t.lines-t.gross)>.02)e.push('La suma de las líneas no coincide con los importes previos del desglose de IVA.');
 if(i.sourceTotal!==null&&Math.abs(t.total-i.sourceTotal)>.02)e.push('El total no coincide con el PDF de origen. Revisa la extracción; para cambiar el supuesto, desvincula el total de origen.');
 if(i.type==='F1'&&(t.total<0||i.lines.some(l=>lineAmount(l)<0)))e.push('Los abonos se emiten como facturas rectificativas.');
 if(i.type!=='F1'&&(!i.original.trim()||!i.reason.trim()))e.push('Indica el motivo y la factura, conjunto de facturas o periodo rectificado.');
 if(!i.reviewed)e.push('Confirma que has revisado los datos antes de emitir.');
 return e;
}
export function rectify(original:Invoice){const i=structuredClone(original);i.id=uuid();i.type='R1';i.series='R'+isoDate().slice(2,4);i.number='';i.original=fullNumber(original);i.date=isoDate();i.dueDate='';i.reason='';i.notes='';i.lines=i.lines.map(l=>({...l,quantity:-l.quantity}));i.taxes=i.taxes.map(t=>({...t,gross:-t.gross,discount:-t.discount,quota:-t.quota}));i.sourceName='';i.sourcePage=0;i.sourceTotal=null;i.importWarnings=[];i.reviewed=false;return i;}
