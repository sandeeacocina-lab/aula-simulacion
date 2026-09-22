import {FILE_ACCEPT} from './mail-files';
export const DOCUMENT_ACCEPT=FILE_ACCEPT;
export const DOCUMENT_CATEGORIES={'sin-clasificar':'Sin clasificar',compra:'Compras y gastos',venta:'Ventas e ingresos',banco:'Banca y tesorería',laboral:'Personal y nóminas',impuestos:'Impuestos',otros:'Otros documentos'} as const;
export const DOCUMENT_STATUSES={pendiente:'Pendiente','en-curso':'En curso',completado:'Completado'} as const;
export type DocumentCategory=keyof typeof DOCUMENT_CATEGORIES;
export type DocumentStatus=keyof typeof DOCUMENT_STATUSES;
export type Assignment={id:string;title:string;period:string;instructions:string;created_at:string;revision:number;total:number;completed:number};
export type PracticeDocument={id:string;assignment_id:string;name:string;type:string;size:number;position:number;category:DocumentCategory;status:DocumentStatus;notes:string;revision:number};
export type Documentation={assignments:Assignment[];documents:PracticeDocument[]};
export function checkDocuments(files:{name:string;size:number}[],existingCount=0){
 if(files.length+existingCount>50)return 'Cada encargo puede tener hasta 50 documentos.';
 for(const file of files){
  if(!DOCUMENT_ACCEPT.split(',').some(ext=>file.name.toLowerCase().endsWith(ext)))return 'Formato no admitido: '+file.name+'. Usa documentos, hojas de cálculo, imágenes, PDF o ZIP.';
  if(!file.size)return 'El archivo '+file.name+' está vacío.';
  if(file.size>8*1024*1024)return 'El archivo '+file.name+' supera los 8 MB.';
 }
 if(files.reduce((sum,file)=>sum+file.size,0)>60*1024*1024)return 'Los documentos superan el límite de 60 MB.';
 return '';
}
