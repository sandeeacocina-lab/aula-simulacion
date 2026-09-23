import type {Workbook} from 'exceljs';

// Some spreadsheet exporters use a prefix for SpreadsheetML elements. ExcelJS
// expects their unprefixed names. Normalize only that namespace in memory;
// relationship attributes, formulas and cell values remain unchanged.
export function normalizeSpreadsheetXml(xml:string){
 const declarations=[...xml.matchAll(/\bxmlns:([A-Za-z_][\w.-]*)=(['"])http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main\2/g)];
 if(!declarations.length)return xml;
 let hasDefault=/\bxmlns\s*=/.test(xml);
 for(const [declaration,prefix] of declarations){
  const escaped=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  xml=xml.replace(new RegExp('(<\\/?)'+escaped+':','g'),'$1');
  xml=xml.replace(declaration,hasDefault?'':'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
  hasDefault=true;
 }
 return xml;
}

export async function readBankWorkbook(data:ArrayBuffer):Promise<Workbook>{
 const [{default:ExcelJS},{default:JSZip}]=await Promise.all([import('exceljs'),import('jszip')]);
 const zip=await JSZip.loadAsync(data);
 let changed=false;
 for(const entry of Object.values(zip.files)){
  if(entry.dir||!/^xl\/.*\.xml$/.test(entry.name))continue;
  const xml=await entry.async('string'),normalized=normalizeSpreadsheetXml(xml);
  if(xml!==normalized){zip.file(entry.name,normalized);changed=true;}
 }
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(changed?await zip.generateAsync({type:'arraybuffer'}):data);
 return book;
}
