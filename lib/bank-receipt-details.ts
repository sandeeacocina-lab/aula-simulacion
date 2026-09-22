import {BankError,cents,validDate} from './bank-xml';
import type {FinanceData,Installment} from './bank-finance';

export type FeeBreakdown={type:'fee';base:number;vatMode:'exempt'|'taxable';vatRate:number;vat:number;total:number};
export type InterestBreakdown={type:'interest';gross:number;withholdingRate:number;withholding:number;net:number;periodFrom:string;periodTo:string};
export type InstallmentBreakdown={type:'installment';productId:string;title:string;kind:'loan'|'leasing';contractDate:string;originalPrincipal:number;months:number;number:number;dueDate:string;tin:number;vatRate:number;principal:number;interest:number;vat:number;total:number;balanceBefore:number;balanceAfter:number;option:boolean};
export type BankBreakdown=FeeBreakdown|InterestBreakdown|InstallmentBreakdown;
export type BankReceiptDetails={version:1;holder:{name:string;nif:string;iban:string};breakdown:BankBreakdown|null};

function percentage(value:unknown,label:string){
 const s=String(value).trim().replace(',','.');
 if(!/^\d{1,3}(\.\d{1,2})?$/.test(s)||Number(s)>100)throw new BankError('Revisa '+label+' (0 a 100 %).');
 return Number(s);
}
// Calculate in cents and hundredths of a percentage point, with one final rounding.
const charge=(amount:number,rate:number)=>Math.round(amount*Math.round(rate*100)/10000);
export function feeBreakdown(p:Record<string,unknown>):FeeBreakdown{
 const base=cents(p.amount,'la comisión sin IVA'),vatMode=p.vatMode??'exempt';
 if(vatMode!=='exempt'&&vatMode!=='taxable')throw new BankError('Selecciona si la comisión está exenta o lleva IVA.');
 const vatRate=vatMode==='taxable'?percentage(p.vatRate??'21','el tipo de IVA'):0,vat=charge(base,vatRate);
 return {type:'fee',base,vatMode,vatRate,vat,total:base+vat};
}
export function interestBreakdown(p:Record<string,unknown>):InterestBreakdown{
 const gross=cents(p.amount,'los intereses brutos'),withholdingRate=percentage(p.withholdingRate??'19','el tipo de retención');
 const periodFrom=p.periodFrom?validDate(p.periodFrom):'',periodTo=p.periodTo?validDate(p.periodTo):'';
 if(!!periodFrom!==!!periodTo||periodFrom>periodTo)throw new BankError('Indica las dos fechas del periodo liquidado, en orden.');
 if(periodTo&&periodTo>validDate(p.bookingDate))throw new BankError('El periodo liquidado no puede terminar después de la fecha de contabilización.');
 const withholding=charge(gross,withholdingRate);
 return {type:'interest',gross,withholdingRate,withholding,net:gross-withholding,periodFrom,periodTo};
}
export function installmentBreakdown(productId:string,data:FinanceData,s:Installment):InstallmentBreakdown{
 return {type:'installment',productId,title:data.title,kind:data.kind,contractDate:data.bookingDate,originalPrincipal:data.principal,months:data.months,number:s.number,dueDate:s.date,tin:data.tin,vatRate:data.vat,principal:s.principal,interest:s.interest,vat:s.tax,total:s.total,balanceBefore:s.balance+s.principal,balanceAfter:s.balance,option:s.option};
}
