export type ContractField={path:string;group:string;label:string;value:string};
export type SepeContract={line:number;code:string;employerId:string;ccc:string;personId:string;name:string;birthDate:string;startDate:string;endDate:string;occupation:string;fields:ContractField[]};
export type SepeParsed={contracts:SepeContract[];warnings:string[];encoding:string};
export type SepeBatch={hasXml?:boolean;id:string;reference:string;filename:string;count:number;communicationDate:string;createdAt:string;warnings:string[]};
export type SepeReceipt={batch:SepeBatch;contracts:SepeContract[]};
export type SepeDuplicate={batchId:string;reference:string;name:string};
export type SepePreview=SepeParsed&{fingerprint:string;duplicates:SepeDuplicate[]};
export type SepeHistory={batches:(SepeBatch&{names:string})[];total:number;contractCount:number;page:number;pageSize:number};
export const sepeDate=(value:string)=>value?value.split('-').reverse().join('/'):'No consta';
