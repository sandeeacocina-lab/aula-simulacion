import {BankError,cents,validDate} from './bank-xml';
export type Installment={number:number;date:string;principal:number;interest:number;tax:number;total:number;balance:number;option:boolean};
export type FinanceData={kind:'loan'|'leasing';title:string;principal:number;months:number;tin:number;vat:number;residual:number;bookingDate:string;firstDate:string;schedule:Installment[]};
export type FinanceProduct={id:string;kind:'loan'|'leasing';title:string;data:FinanceData;createdAt:string;payments:{installment:number;batchId:string}[]};
export type Mandate={id:string;name:string;iban:string;reference:string;signedDate:string;direction:'in'|'out';status:'active'|'inactive';revision:number};
function rate(value:unknown,label:string,max:number){const s=String(value);if(!/^\d{1,3}(\.\d{1,2})?$/.test(s)||Number(s)>max)throw new BankError('Revisa '+label+'.');return Number(s);}
function addMonth(date:string,n:number){const [year,month,day]=date.split('-').map(Number),first=new Date(Date.UTC(year,month-1+n,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return validDate([first.getUTCFullYear(),String(first.getUTCMonth()+1).padStart(2,'0'),String(Math.min(day,last)).padStart(2,'0')].join('-'));}
export function financePlan(p:Record<string,unknown>):FinanceData{
 if(p.kind!=='loan'&&p.kind!=='leasing')throw new BankError('Elige préstamo o leasing.');const kind=p.kind,title=String(p.title||'').trim();if(!title||title.length>160)throw new BankError('Indica la finalidad o el bien financiado.');
 const principal=cents(p.amount,'el capital'),months=Number(p.months);if(!Number.isInteger(months)||months<1||months>240)throw new BankError('El plazo debe ser de 1 a 240 meses.');
 const tin=rate(p.tin,'el TIN (0 a 50 %)',50),vat=kind==='leasing'?rate(p.vat,'el IVA del supuesto (0 a 30 %)',30):0,residual=kind==='leasing'?cents(p.residual,'la opción de compra',true):0;
 if(residual>=principal)throw new BankError('La opción de compra debe ser inferior al capital financiado.');
 const bookingDate=validDate(p.bookingDate),firstDate=validDate(p.firstDate);if(firstDate<=bookingDate)throw new BankError('La primera cuota debe ser posterior a la formalización.');
 const r=tin/1200,factor=(1+r)**months,base=r?Math.round((principal-residual/factor)*r/(1-1/factor)):Math.round((principal-residual)/months);let balance=principal;const schedule:Installment[]=[];
 for(let i=1;i<=months;i++){const interest=Math.round(balance*r),amortization=i===months?balance-residual:Math.min(balance-residual,base-interest);if(amortization<0)throw new BankError('Revisa el importe, el plazo y el valor residual.');balance-=amortization;const tax=Math.round((amortization+interest)*vat/100);schedule.push({number:i,date:addMonth(firstDate,i-1),principal:amortization,interest,tax,total:amortization+interest+tax,balance,option:false});}
 if(residual)schedule.push({number:months+1,date:addMonth(firstDate,months-1),principal:residual,interest:0,tax:Math.round(residual*vat/100),total:residual+Math.round(residual*vat/100),balance:0,option:true});
 return {kind,title,principal,months,tin,vat,residual,bookingDate,firstDate,schedule};
}
