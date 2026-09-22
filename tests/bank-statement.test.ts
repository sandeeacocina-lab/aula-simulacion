import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {writeFileSync} from 'node:fs';
function browserStorage(){const data:Record<string,any>={};Object.defineProperties(data,{getItem:{value:(key:string)=>data[key]??null},setItem:{value:(key:string,value:string)=>{data[key]=String(value);}},removeItem:{value:(key:string)=>{delete data[key];}}});return data;}
Object.assign(globalThis,{indexedDB,localStorage:browserStorage(),sessionStorage:browserStorage(),DOMMatrix,ImageData,Path2D});
const {setEngineForTests,freshDatabase,persistDatabase}=await import('../lib/local/runtime');
const {localRequest}=await import('../lib/local/dispatch');
const {selectWorkspace}=await import('../lib/local/workspaces');
const {getProfile}=await import('../lib/local/profile');
const {bankStatementPDF}=await import('../lib/bank-statement-pdf');
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
async function post(path:string,data:Record<string,unknown>,status=200){const response=await localRequest('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();expect(response.status,JSON.stringify(result)).toBe(status);return result;}
async function get(query=''){return (await localRequest('/api/banco'+query)).json();}
async function open(){return post('banco',{action:'setup',id:crypto.randomUUID(),amount:'1000',iban:getProfile().iban,bookingDate:'2026-01-01',consent:true},201);}
async function operation(kind:string,amount:string,bookingDate:string,concept:string){const data={id:crypto.randomUUID(),kind,amount,bookingDate,concept,name:kind==='receipt'?'Cliente de prueba':'Proveedor de prueba',iban:'ES0000000000000000000000',reference:concept};const preview=await post('banco/operaciones',{...data,action:'manual-preview'});return post('banco/operaciones',{...data,action:'manual-execute',revision:preview.account.revision,fingerprint:preview.fingerprint,consent:true,warningsAccepted:true},201);}
async function pdfText(bytes:Uint8Array){const pdf=await getDocument({data:bytes.slice(),isEvalSupported:false}).promise;try{const pages=[];for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number);pages.push((await page.getTextContent()).items.map((item:any)=>item.str||'').join(' '));}return {pages,count:pdf.numPages};}finally{await pdf.destroy();}}
beforeAll(async()=>setEngineForTests(await initSqlJs()));
beforeEach(async()=>{selectWorkspace('arrea');const db=await freshDatabase();try{for(const id of ['arrea','decasarre'])await persistDatabase(db.export(),{replaceFiles:true},id);}finally{db.close();}});
describe('Extracto bancario cronológico',()=>{
 it('ordena por fecha y registro, muestra saldos cronológicos y mantiene los justificantes originales',async()=>{
  await open();const transfer=await operation('transfer','100','2026-01-20','Pago veinte');await operation('receipt','50','2026-01-10','Cobro diez');await operation('fee','10','2026-01-20','Comisión veinte');
  const state=await get('?view=account');expect(state.movements.map((row:any)=>row.id)).toEqual([1,3,2,4]);expect(state.movements.map((row:any)=>row.balance)).toEqual([100000,105000,95000,94000]);expect(state.account.balance).toBe(94000);
  const filtered=await get('?from=2026-01-10&to=2026-01-20&q=Cliente');expect(filtered.movements).toHaveLength(1);expect(filtered.movements[0].balance).toBe(105000);
  const history=await get('?view=history');expect(history.batches.map((row:any)=>row.bookingDate)).toEqual(['2026-01-01','2026-01-10','2026-01-20','2026-01-20']);
  expect((await get('?batch='+transfer.batch.id)).batch.after).toBe(90000);
  const csv=await (await localRequest('/api/banco?export=csv')).text();const lines=csv.trim().split('\r\n');expect(lines).toHaveLength(5);expect(lines.slice(1).map(row=>row.split(';')[0])).toEqual(['"1"','"3"','"2"','"4"']);expect(lines[2]).toContain('"1050,00"');
  const response=await localRequest('/api/banco?export=pdf&from=2026-01-10&to=2026-01-20&q=Cliente');expect(response.headers.get('Content-Type')).toBe('application/pdf');expect(response.headers.get('Content-Disposition')).toContain('.pdf');
  const text=(await pdfText(new Uint8Array(await response.arrayBuffer()))).pages.join(' ');expect(text).toContain('ARREA Eventos');expect(text).toContain('Cobro diez');expect(text).not.toContain('Pago veinte');expect(text).toContain('1050,00');expect(text).toContain('940,00');
  selectWorkspace('decasarre');expect((await get()).movements).toEqual([]);expect((await localRequest('/api/banco?export=pdf')).status).toBe(409);
 });
 it('mantiene el orden entre páginas y exporta todos los resultados, también en consultas vacías',async()=>{
  await open();for(let index=34;index>=1;index--){const state=await get('?view=summary');await post('banco',{action:'funds',id:crypto.randomUUID(),amount:'1',concept:'Ingreso '+index,bookingDate:'2026-02-'+String(Math.ceil(index/2)).padStart(2,'0'),consent:true,revision:state.account.revision},201);}
  const first=await get('?page=0'),second=await get('?page=1');expect(first.movements).toHaveLength(30);expect(second.movements).toHaveLength(5);const rows=[...first.movements,...second.movements];expect(rows.map((row:any)=>row.bookingDate)).toEqual(rows.map((row:any)=>row.bookingDate).sort());expect(new Set(rows.map((row:any)=>row.id)).size).toBe(35);
  const csv=await (await localRequest('/api/banco?export=csv&page=1')).text();expect(csv.trim().split('\r\n')).toHaveLength(36);
  const response=await localRequest('/api/banco?export=pdf&page=1'),pdf=await pdfText(new Uint8Array(await response.arrayBuffer()));expect(pdf.count).toBeGreaterThan(1);expect(pdf.pages.join(' ')).toContain('Ingreso 1');expect(pdf.pages.join(' ')).toContain('Ingreso 34');expect(pdf.pages.join(' ')).toContain('Saldo inicial de la cuenta');
  const empty=await localRequest('/api/banco?export=pdf&from=2027-01-01');expect((await pdfText(new Uint8Array(await empty.arrayBuffer()))).pages[0]).toContain('No hay movimientos');
 });
 it('pagina textos largos con cabeceras, importes legibles y número total de páginas',async()=>{
  await open();const state=await get(),original=state.movements[0];
  const movements=Array.from({length:45},(_,index)=>({...original,id:index+1,name:index%3===0?'Organización Empresarial de Valladolid - Área de Comunicación y Atención al Cliente':'Proveedor de servicios',concept:index%4===0?'Servicios de organización, coordinación y montaje de un encuentro empresarial. Revisión del presupuesto y preparación de materiales para la jornada profesional.':'Factura de servicios del trimestre',reference:'FACT-'+String(index+1).padStart(4,'0'),bookingDate:'2026-02-'+String(1+Math.floor(index/2)).padStart(2,'0'),delta:index%2===0?125050:-23515,balance:100000+index*101535}));
  const bytes=bankStatementPDF({company:{name:'ARREA Eventos',nif:'B47425400'},account:{...state.account,balance:movements.at(-1)!.balance},movements,from:'2026-02-01',to:'2026-02-28',search:'Servicios de organización',issuedAt:new Date('2026-09-22T10:00:00Z')});
  if(process.env.BANK_STATEMENT_SAMPLE)writeFileSync(process.env.BANK_STATEMENT_SAMPLE,bytes);
  const parsed=await pdfText(bytes);expect(parsed.count).toBeGreaterThan(2);for(const [index,page] of parsed.pages.entries()){expect(page).toContain('EXTRACTO DE CUENTA');expect(page).toContain('Página '+(index+1)+' de '+parsed.count);expect(page).toContain('SIN VALIDEZ BANCARIA');}expect(parsed.pages.join(' ')).toContain('FACT-0045');
 });
});
