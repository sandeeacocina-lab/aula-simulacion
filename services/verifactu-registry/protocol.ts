// Public metadata only. PDF, customer, lines, IBAN and signing credential stay local.
export type RegistryInvoice={id:string;nif:string;number:string;date:string;total:string};
export type RegistryEvent={version:1;id:string;invoice:RegistryInvoice;hash:string;previousHash:string;kind:'alta'|'subsanacion'|'anulacion';status:'Correcto'|'AceptadoConErrores'|'Incorrecto';createdAt:string;signed:boolean};
export type RegistryReceipt={practiceId:string;recordId:string;hash:string;receivedAt:string};
export type RegistryLookup=RegistryReceipt & {invoice:RegistryInvoice;kind:RegistryEvent['kind'];status:RegistryEvent['status'];createdAt:string;signed:boolean};
export const validRegistryId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{10,90}$/.test(v);
export const validPracticeId=(v:unknown):v is string=>typeof v==='string'&&/^[A-F0-9]{64}$/.test(v);
export const validWriteKey=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function parseRegistryEvent(value:unknown):RegistryEvent{
 const e=value as RegistryEvent,i=e?.invoice;
 if(e?.version!==1||!validRegistryId(e.id)||!i||!validRegistryId(i.id)||typeof i.nif!=='string'||!/^[-a-zA-Z0-9]{1,30}$/.test(i.nif)||typeof i.number!=='string'||!/^[-\p{L}\p{N}_.]{1,30}\/\d{1,12}$/u.test(i.number)||!date(i.date)||typeof i.total!=='string'||!/^-?\d{1,13}\.\d{2}$/.test(i.total))throw Error('Datos de cotejo no válidos.');
 if(!validPracticeId(e.hash)||(e.previousHash!==''&&!validPracticeId(e.previousHash))||e.hash===e.previousHash||!['alta','subsanacion','anulacion'].includes(e.kind)||!['Correcto','AceptadoConErrores','Incorrecto'].includes(e.status)||typeof e.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.createdAt)||!Number.isFinite(Date.parse(e.createdAt))||typeof e.signed!=='boolean'||e.kind!=='alta'&&e.status!=='Correcto')throw Error('Registro de cotejo no válido.');
 return {version:1,id:e.id,invoice:{id:i.id,nif:i.nif,number:i.number,date:i.date,total:i.total},hash:e.hash,previousHash:e.previousHash,kind:e.kind,status:e.status,createdAt:e.createdAt,signed:e.signed};
}
export function matchesRegistryInvoice(a:RegistryInvoice,b:RegistryInvoice){return a.id===b.id&&a.nif===b.nif&&a.number===b.number&&a.date===b.date&&a.total===b.total;}
