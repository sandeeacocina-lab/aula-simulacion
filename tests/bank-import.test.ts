import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {importCents,importDate,parseImportMatrix,validateImportRows,type ImportRow} from '../lib/bank-import';

function browserStorage(){const data:Record<string,any>={};Object.defineProperties(data,{getItem:{value:(key:string)=>data[key]??null},setItem:{value:(key:string,value:string)=>{data[key]=String(value);}},removeItem:{value:(key:string)=>{delete data[key];}}});return data;}
Object.assign(globalThis,{indexedDB,localStorage:browserStorage(),sessionStorage:browserStorage()});
const {setEngineForTests,freshDatabase,persistDatabase}=await import('../lib/local/runtime');
const {localRequest}=await import('../lib/local/dispatch');
const {selectWorkspace}=await import('../lib/local/workspaces');
const {createBackup,restoreBackup}=await import('../lib/local/backup');
const {getProfile}=await import('../lib/local/profile');
async function post(path:string,data:Record<string,unknown>,status=200){const response=await localRequest('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();expect(response.status,JSON.stringify(result)).toBe(status);return result;}
async function state(){const response=await localRequest('/api/banco');expect(response.ok).toBe(true);return response.json();}
async function open(amount='1000'){return post('banco',{action:'setup',id:crypto.randomUUID(),amount,iban:getProfile().iban,bookingDate:'2026-01-01',consent:true},201);}
const row=(changes:Partial<ImportRow>={}):ImportRow=>({row:2,date:'2026-01-10',concept:'Factura 123',name:'Cliente ficticio',reference:'F-123',iban:'ES0000000000000000000000',delta:12100,...changes});
async function review(rows:ImportRow[],allowDuplicates=false){return post('banco/importar',{action:'preview',filename:'practica.xlsx',rows,allowDuplicates});}
async function prepare(rows:ImportRow[],allowDuplicates=false){const preview=await review(rows,allowDuplicates);return {action:'execute',id:crypto.randomUUID(),filename:'practica.xlsx',rows,allowDuplicates,revision:preview.revision,fingerprint:preview.fingerprint,consent:true};}
beforeAll(async()=>setEngineForTests(await initSqlJs()));
beforeEach(async()=>{selectWorkspace('arrea');const db=await freshDatabase();try{for(const id of ['arrea','decasarre'])await persistDatabase(db.export(),{replaceFiles:true},id);}finally{db.close();}});

describe('Lectura de movimientos de Excel',()=>{
 it('interpreta céntimos, fechas de Excel y columnas alternativas en español',()=>{
  expect(importCents('1.234,56 €')).toBe(123456);expect(importCents('(45,60)')).toBe(-4560);expect(importCents(121.05)).toBe(12105);
  expect(importDate('2/9/2026')).toBe('2026-09-02');expect(importDate(46267)).toBe('2026-09-02');
  const result=parseImportMatrix([['Práctica bancaria'],['Fecha','Descripción','Empresa o persona','Referencia','Entrada EUR','Salida EUR'],['02/09/2026','Factura','Cliente','F-1','1.234,56',''],['03/09/2026','Recibo','Proveedor','R-1','','45,60']]);
  expect(result.errors).toEqual([]);expect(result.rows.map(r=>[r.row,r.date,r.delta])).toEqual([[3,'2026-09-02',123456],[4,'2026-09-03',-4560]]);
 });
 it('rechaza fechas imposibles, importes ambiguos, filas incompletas y más de 500 movimientos',()=>{
  for(const value of ['31/02/2026','2026-13-01',NaN])expect(()=>importDate(value)).toThrow();
  for(const value of ['1,2345',1.001,Infinity,'1000000,01'])expect(()=>importCents(value)).toThrow();
  expect(()=>validateImportRows([null])).toThrow('Fila 2');expect(()=>validateImportRows([row({delta:0})])).toThrow('distinto de cero');
  expect(()=>validateImportRows(Array.from({length:501},()=>row()))).toThrow('500');
  const invalid=parseImportMatrix([['Fecha','Concepto','Importe','Entrada','Salida'],['2026-09-02','Factura',10,20,''],['2026-09-03','','',1,1]]);
  expect(invalid.rows).toEqual([]);expect(invalid.errors).toHaveLength(2);
 });
});

describe('Importación local atómica y aislada',()=>{
 it('previsualiza y confirma en HTTP sin crypto.subtle ni crypto.randomUUID',async()=>{
  await open();const rows=[row()],id=crypto.randomUUID(),original=crypto;
  const canonical=JSON.stringify({workspace:'arrea',rows,allowDuplicates:false});
  const expected=Array.from(new Uint8Array(await original.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),byte=>byte.toString(16).padStart(2,'0')).join('');
  vi.stubGlobal('crypto',{getRandomValues:original.getRandomValues.bind(original)});
  try{
   const preview=await review(rows);expect(preview.fingerprint).toBe(expected);
   const request={action:'execute',id,filename:'practica.xlsx',rows,allowDuplicates:false,revision:preview.revision,fingerprint:preview.fingerprint,consent:true};
   await post('banco/importar',request,201);await post('banco/importar',request);expect((await state()).total).toBe(2);expect((await state()).account.balance).toBe(112100);
  }finally{vi.unstubAllGlobals();}
 });
 it('previsualiza sin escribir, ordena por fecha y registra las entradas y salidas en un único lote',async()=>{
  await open();const rows=[row({row:2,date:'2026-01-20',delta:-5050,concept:'Recibo',reference:'R-1'}),row({row:3,delta:12100})];
  const preview=await review(rows);expect(preview).toMatchObject({count:2,before:100000,after:107050,credits:12100,debits:5050,skipped:0,errors:[]});expect((await state()).total).toBe(1);
  const result=await post('banco/importar',await prepare(rows),201),after=await state();expect(after.total).toBe(3);expect(after.account.balance).toBe(107050);
  expect(after.movements.slice(1).map((r:any)=>[r.bookingDate,r.delta,r.balance])).toEqual([['2026-01-10',12100,112100],['2026-01-20',-5050,107050]]);
  const receipt=await (await localRequest('/api/banco?batch='+result.id)).json();expect(receipt.batch.kind).toBe('spreadsheet');expect(receipt.items).toHaveLength(2);expect(receipt.items.map((r:any)=>r.delta)).toEqual([12100,-5050]);
 });
 it('omite duplicados y hace los reintentos idempotentes, permitiendo coincidencias solo al confirmarlas',async()=>{
  await open();const rows=[row(),row({row:3})],preview=await review(rows);expect(preview.count).toBe(1);expect(preview.skipped).toBe(1);expect(preview.rows[1].duplicateReason).toContain('archivo');
  const request=await prepare(rows),first=await post('banco/importar',request,201);expect(await post('banco/importar',request)).toEqual(first);expect((await state()).total).toBe(2);
  const repeated=await review(rows);expect(repeated.count).toBe(0);expect(repeated.rows.every((r:any)=>r.duplicate)).toBe(true);
  await post('banco/importar',await prepare(rows),409);expect((await state()).total).toBe(2);
  const allowed=await prepare(rows,true);await post('banco/importar',allowed,201);await post('banco/importar',allowed);expect((await state()).total).toBe(4);
  await post('banco/importar',await prepare(rows,true),201);expect((await state()).total).toBe(6);
  await post('banco/importar',{...request,rows:[row({delta:12101})]},409);expect((await state()).total).toBe(6);
 });
 it('rechaza datos alterados, revisiones antiguas, importes inválidos y saldos negativos sin escrituras parciales',async()=>{
  await open('10');const invalidRows=[row({delta:-1500}),row({row:3,date:'2026-01-11',delta:2000,reference:'F-2'})];
  const insufficient=await prepare(invalidRows);await post('banco/importar',insufficient,409);expect((await state()).account.balance).toBe(1000);expect((await state()).total).toBe(1);
  const request=await prepare([row()]);await post('banco/importar',{...request,rows:[row({delta:100.1})]},400);await post('banco/importar',{...request,rows:[row({delta:100})]},409);await post('banco/importar',{...request,consent:false},409);
  await post('banco/importar',await prepare([row({reference:'Otro'})]),201);const before=await createBackup();await post('banco/importar',request,409);const after=await createBackup();expect(after.tables).toEqual(before.tables);
  expect(after.tables.practice_guards.rows).toEqual([]);expect((await localRequest('/api/banco/importar')).status).toBe(405);
 });
 it('mantiene las empresas independientes y preserva el lote al exportar y restaurar la práctica',async()=>{
  await open();const rows=[row()],arreaRequest=await prepare(rows);await post('banco/importar',arreaRequest,201);const arrea=await createBackup();
  selectWorkspace('decasarre');expect((await state()).account).toBeNull();await open();await post('banco/importar',{...arreaRequest,id:crypto.randomUUID()},409);expect((await state()).total).toBe(1);
  const decaRequest=await prepare(rows);expect(decaRequest.fingerprint).not.toBe(arreaRequest.fingerprint);await post('banco/importar',decaRequest,201);const decasarre=await createBackup();
  selectWorkspace('arrea');await post('banco/importar',await prepare([row({reference:'Más datos'})]),201);await restoreBackup(arrea);expect((await state()).total).toBe(2);expect((await state()).account.balance).toBe(112100);expect((await createBackup()).tables).toEqual(arrea.tables);
  await post('banco/importar',arreaRequest);expect((await state()).total).toBe(2);
  selectWorkspace('decasarre');expect((await createBackup()).tables).toEqual(decasarre.tables);
 });
});
