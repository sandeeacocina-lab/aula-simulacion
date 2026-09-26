import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {blankInvoice,digest,fullNumber,invoiceErrors,practiceSignature,rectify,totals,type Invoice,type PracticeSignature} from '../lib/verifactu/model';
import {linkRectification} from '../lib/verifactu/import';

function browserStorage(){const data:Record<string,any>={};Object.defineProperties(data,{getItem:{value:(key:string)=>data[key]??null},setItem:{value:(key:string,value:string)=>{data[key]=String(value);}},removeItem:{value:(key:string)=>{delete data[key];}}});return data;}
Object.assign(globalThis,{indexedDB,localStorage:browserStorage(),sessionStorage:browserStorage()});
const {setEngineForTests,freshDatabase,persistDatabase}=await import('../lib/local/runtime');
const {getProfile}=await import('../lib/local/profile');
const {selectWorkspace}=await import('../lib/local/workspaces');
const {createBackup,restoreBackup}=await import('../lib/local/backup');
const {saveDraft,saveImported,saveRectificationImport,listInvoices,listRecords,issueInvoice,remedyInvoice,checkChain,sourceFile,qrUrl}=await import('../lib/verifactu/store');
function invoice():Invoice{const i=blankInvoice(getProfile());Object.assign(i,{number:'001',date:'2026-10-12',reviewed:true});i.issuer.address='Domicilio ficticio';i.customer={name:'Cliente de prácticas',nif:'B12345674',address:'Dirección de prácticas',contact:''};i.lines=[{code:'TEST',description:'Servicio del supuesto',quantity:1,price:100,discount:0}];i.taxes=[{gross:100,discount:0,rate:21,quota:21}];return i;}
async function emit(i=invoice(),scenario:'normal'|'warning'|'rejected'='normal'){const saved=await saveDraft(i);const record=await issueInvoice(i.id,saved.revision,scenario,practiceSignature(i));return {i,saved,record};}
function importedRectification(original:Invoice){const i=rectify(original);i.number='001';i.reason='Devolución parcial';i.original='';i.sourceName='abono.pdf';i.sourcePage=1;i.sourceTotal=-36.3;i.lines=[{code:'DEV',description:'Devolución parcial',quantity:1,price:-30,discount:0}];i.taxes=[{gross:-30,discount:0,rate:21,quota:-6.3}];return i;}
const bytes=new TextEncoder().encode('PDF de pruebas conservado como original'),fingerprint=digest(bytes);
beforeAll(async()=>setEngineForTests(await initSqlJs()));
beforeEach(async()=>{for(const key of Object.keys(localStorage))localStorage.removeItem(key);selectWorkspace('decasarre');const db=await freshDatabase();try{for(const id of ['arrea','decasarre'])await persistDatabase(db.export(),{replaceFiles:true},id);}finally{db.close();}});

describe('Facturación firmada en la práctica',()=>{
 it('exige certificado y conformidad, conserva la firma y bloquea cambios posteriores',async()=>{
  const i=invoice(),draft=await saveDraft(i),signature=practiceSignature(i);
  for(const invalid of [undefined,{...signature,conform:false},{...signature,nif:'OTRA'}])await expect(issueInvoice(i.id,draft.revision,'normal',invalid as PracticeSignature)).rejects.toThrow('certificado');
  expect(await listRecords()).toHaveLength(0);expect((await listInvoices())[0].state).toBe('draft');
  const record=await issueInvoice(i.id,draft.revision,'normal',signature);
  expect(record.payload.signature).toEqual(signature);expect(record.status).toBe('Correcto');expect(checkChain(await listRecords())).toBe(true);
  await expect(saveDraft({...i,number:'002'},draft.revision)).rejects.toThrow('emitido');
  await expect(issueInvoice(i.id,draft.revision,'normal',signature)).rejects.toThrow('emitido');
  const duplicate=invoice();duplicate.number='1';const d=await saveDraft(duplicate);
  await expect(issueInvoice(duplicate.id,d.revision,'normal',practiceSignature(duplicate))).rejects.toThrow('Ya existe');
  expect(await listRecords()).toHaveLength(1);
 });
 it('serializa dos confirmaciones y solo emite una vez',async()=>{
  const i=invoice(),draft=await saveDraft(i);
  const results=await Promise.allSettled([1,2].map(()=>issueInvoice(i.id,draft.revision,'normal',practiceSignature(i))));
  expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);expect(await listRecords()).toHaveLength(1);
 });
 it('conserva rechazo, subsanación y anulación con sus firmas y huellas',async()=>{
  const {i,record}=await emit(invoice(),'rejected');
  await expect(remedyInvoice(i.id,'subsanacion','Clasificación revisada',record.id,undefined as any)).rejects.toThrow('certificado');
  const correction=await remedyInvoice(i.id,'subsanacion','Clasificación revisada',record.id,practiceSignature(i));
  await expect(remedyInvoice(i.id,'anulacion','Operación inexistente',record.id,practiceSignature(i))).rejects.toThrow('cambiado');
  await remedyInvoice(i.id,'anulacion','Operación inexistente',correction.id,practiceSignature(i));
  const records=await listRecords();expect(records.map(r=>r.kind)).toEqual(['alta','subsanacion','anulacion']);expect(checkChain(records)).toBe(true);
  expect(records.every(r=>r.payload.signature?.conform)).toBe(true);expect((await listInvoices())[0].invoice).toEqual(i);
 });
});

describe('Rectificativas importadas y conservación del original',()=>{
 it('vincula el PDF de una devolución parcial sin sustituir los importes por los de la factura original',async()=>{
  const {i}=await emit(),rect=importedRectification(i),draft=await saveRectificationImport(rect,bytes,fingerprint,i.id);
  expect(draft.invoice.original).toBe(fullNumber(i));expect(totals(draft.invoice).total).toBe(-36.3);expect(draft.invoice.reviewed).toBe(false);
  expect((await sourceFile(draft.sourceKey))?.bytes).toEqual(bytes);
  expect(invoiceErrors(draft.invoice)).toContain('Confirma que has revisado los datos antes de emitir.');
  const reviewed={...draft.invoice,reviewed:true},saved=await saveDraft(reviewed,draft.revision);
  await issueInvoice(reviewed.id,saved.revision,'normal',practiceSignature(reviewed));
  await expect(saveRectificationImport(importedRectification(i),bytes,fingerprint,i.id)).rejects.toThrow('ya está emitida');
  expect((await listInvoices()).find(r=>r.invoice.id===i.id)?.invoice).toEqual(i);expect(checkChain(await listRecords())).toBe(true);
 });
 it('rechaza una factura ordinaria, otro cliente y otra referencia sin escrituras parciales',async()=>{
  const {i}=await emit(),rect=importedRectification(i),before=await createBackup();
  for(const invalid of [{...rect,type:'F1'},{...rect,customer:{...rect.customer,nif:'OTRO'}},{...rect,original:'FV26/099'}] as Invoice[])await expect(saveRectificationImport(invalid,bytes,fingerprint,i.id)).rejects.toThrow();
  const after=await createBackup();expect(after.tables).toEqual(before.tables);expect(after.files).toEqual(before.files);
 });
 it('reutiliza el borrador de un PDF ya importado y conserva sus datos revisados',async()=>{
  const {i}=await emit(),rect=importedRectification(i);await saveImported([rect],bytes,fingerprint);
  const existing=(await listInvoices()).find(r=>r.invoice.id===rect.id)!;
  await saveDraft({...existing.invoice,number:'015',reason:'Motivo ya revisado'},existing.revision);
  const linked=await saveRectificationImport(importedRectification(i),bytes,fingerprint,i.id);
  expect(linked.invoice.id).toBe(rect.id);expect(linked.invoice.number).toBe('015');expect(linked.invoice.reason).toBe('Motivo ya revisado');expect(linked.invoice.original).toBe(fullNumber(i));expect(await listInvoices()).toHaveLength(2);
 });
 it('conserva PDF, firmas e historial al exportar y restaurar, sin mezclar empresas',async()=>{
  const {i}=await emit();await saveRectificationImport(importedRectification(i),bytes,fingerprint,i.id);const backup=await createBackup();
  selectWorkspace('arrea');expect(await listInvoices()).toHaveLength(0);const arrea=await emit();
  selectWorkspace('decasarre');const fresh=await freshDatabase();await persistDatabase(fresh.export(),{replaceFiles:true});fresh.close();await restoreBackup(backup);
  const restored=await createBackup();expect(restored.tables).toEqual(backup.tables);expect(restored.files).toEqual(backup.files);expect(checkChain(await listRecords())).toBe(true);
  selectWorkspace('arrea');expect((await listInvoices())[0].invoice.id).toBe(arrea.i.id);
 });
 it('rechaza copias incompletas o alteradas y admite copias anteriores al módulo',async()=>{
  const {i}=await emit();await saveRectificationImport(importedRectification(i),bytes,fingerprint,i.id);const backup=await createBackup();
  const missing=structuredClone(backup);missing.files=[];await expect(restoreBackup(missing)).rejects.toThrow('PDF de origen');
  const tampered=structuredClone(backup),table=tampered.tables.vf_records;table.rows[0][table.columns.indexOf('hash')]='ALTERADA';await expect(restoreBackup(tampered)).rejects.toThrow('cadena');
  expect((await createBackup()).tables).toEqual(backup.tables);
  const legacy=structuredClone(backup);delete legacy.tables.vf_invoices;delete legacy.tables.vf_records;delete legacy.tables.vf_registry;legacy.files=[];await restoreBackup(legacy);expect(await listRecords()).toHaveLength(0);expect(await listInvoices()).toHaveLength(0);
 });
 it('codifica el cotejo en la central conservando el número y el total',()=>{
  const i=invoice(),url=new URL(qrUrl(i,'https://simulacion.sandramangas.com/?anterior=1#/servicios?empresa=decasarre'));
  expect(url.origin).toBe('https://simulacion.sandramangas.com');expect(url.search).toBe('');const p=new URLSearchParams(url.hash.split('?')[1]);expect(p.get('numero')).toBe('FV26/001');expect(p.get('total')).toBe('121.00');expect(p.get('cotejo')).toBe(i.id);
 });
});
