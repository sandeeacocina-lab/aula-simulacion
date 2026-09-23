export type SocialKind='RNT'|'RLC';
export type SocialHeader={company:string;ccc:string;employerId:string;periodFrom:string;periodTo:string;qualification:string;controlDate:string;liquidationNumber:string;workers:number;scope:string;entity:string};
export type SocialLine={naf:string;ipf:string;caf:string;from:string;to:string;days:number;hours:string;extraHours:string;description:string;amount:number};
export type SocialAmount={description:string;base:number|null;amount:number};
export type SocialDocument={kind:SocialKind;filename:string;header:SocialHeader;lines:SocialLine[];amounts:SocialAmount[];total:number|null;pages:number;sourcePages?:number[];warnings:string[]};
export type SocialDuplicate={batchId:string;reference:string;kind:SocialKind;filename:string};
export type SocialLiquidation={id:string;company:string;ccc:string;periodFrom:string;periodTo:string;workers:number;kinds:string;total:number|null};
export type SocialPreview={documents:SocialDocument[];fingerprint:string;warnings:string[];duplicates:SocialDuplicate[];liquidations:SocialLiquidation[];selectedLiquidation:string};
export type SocialPayment={status:'pending'|'paid'|'none';label:string;liquidationId?:string;liquidationReference?:string;amount?:number;batchId?:string;reference?:string;iban?:string;date?:string};
export type SocialBatch={id:string;reference:string;company:string;ccc:string;periodFrom:string;periodTo:string;kinds:string;workers:number;total:number|null;submissionDate:string;createdAt:string;warnings:string[];payment?:SocialPayment};
export type SocialReceipt={batch:SocialBatch;documents:SocialDocument[];payment?:SocialPayment};
export type SocialPaymentDetails={batch:SocialBatch;payment:SocialPayment};
export type SocialPaymentReview=SocialPaymentDetails&{account:import('./bank-types').BankAccount;after:number;fingerprint:string;warnings:string[]};
export class SocialError extends Error{constructor(message:string,public status=400,public batchId?:string){super(message);}}
export const socialMoney=(c:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(c/100);
export const socialDate=(d:string)=>d?d.split('-').reverse().join('/'):'—';
export const socialPeriod=(d:string)=>d?d.slice(5)+'/'+d.slice(0,4):'—';
export const socialTitle=(k:SocialKind)=>k==='RNT'?'Relación nominal de trabajadores':'Liquidación de cotizaciones';
