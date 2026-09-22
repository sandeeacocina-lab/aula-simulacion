import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
function browserStorage(){const data:Record<string,any>={};Object.defineProperties(data,{getItem:{value:(key:string)=>data[key]??null},setItem:{value:(key:string,value:string)=>{data[key]=String(value);}},removeItem:{value:(key:string)=>{delete data[key];}}});return data;}
Object.assign(globalThis,{indexedDB,localStorage:browserStorage(),sessionStorage:browserStorage()});
const {setEngineForTests,freshDatabase,persistDatabase,readDatabase,readStore,allFiles}=await import('../lib/local/runtime');
const {localRequest}=await import('../lib/local/dispatch');
const {selectWorkspace}=await import('../lib/local/workspaces');
const {createBackup,restoreBackup}=await import('../lib/local/backup');
async function post(data:Record<string,unknown>,expected=200){const response=await localRequest('/api/documentacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();expect(response.status,JSON.stringify(result)).toBe(expected);return result;}
async function state(){return (await localRequest('/api/documentacion')).json();}
async function create(files=[new File(['Factura de prueba'],'factura.txt',{type:'text/plain'}),new File(['Pedido de prueba'],'pedido.xml',{type:'application/xml'})]){const id=crypto.randomUUID(),form=new FormData();form.set('assignment',JSON.stringify({action:'create',id,title:'Operaciones del trimestre',period:'1T 2026',instructions:'Clasifica los documentos y prepara los trámites.'}));for(const file of files)form.append('files',file);const response=await localRequest('/api/documentacion',{method:'POST',body:form});expect(response.status,await response.text()).toBe(201);return id;}
async function erase(scope:string,id?:string){const body={scope,...(id?{id}:{})},request=async(data:unknown)=>localRequest('/api/practicas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const preview=await request({...body,action:'preview'});expect(preview.status).toBe(200);const result=await request({...body,action:'delete',token:(await preview.json()).token,confirm:'BORRAR'});expect(result.status,await result.text()).toBe(200);}
beforeAll(async()=>setEngineForTests(await initSqlJs()));
beforeEach(async()=>{selectWorkspace('arrea');const db=await freshDatabase();try{for(const id of ['arrea','decasarre'])await persistDatabase(db.export(),{replaceFiles:true},id);}finally{db.close();}for(const key of Object.keys(localStorage))localStorage.removeItem(key);});
describe('Bandeja de documentación',()=>{
 it('conserva archivos y clasificaciones al recargar y los aísla por empresa',async()=>{
  const id=await create(),initial=await state();expect(initial.assignments[0]).toMatchObject({id,total:2,completed:0});expect(initial.documents.every((file:any)=>file.category==='sin-clasificar'&&file.status==='pendiente')).toBe(true);
  const document=initial.documents.find((file:any)=>file.name==='factura.txt');await post({action:'classify',id:document.id,revision:1,category:'compra',status:'completado',notes:'Factura contabilizada.'});
  const download=await localRequest('/api/documentacion?file='+document.id+'&preview=1');expect(await download.text()).toBe('Factura de prueba');expect(download.headers.get('Content-Disposition')).toMatch(/^attachment/);
  const next=await state();expect(next.assignments[0].completed).toBe(1);expect(next.documents.find((file:any)=>file.id===document.id)).toMatchObject({category:'compra',status:'completado',notes:'Factura contabilizada.',revision:2});
  selectWorkspace('decasarre');expect((await state()).assignments).toEqual([]);expect((await localRequest('/api/documentacion?file='+document.id)).status).toBe(404);expect((await allFiles()).size).toBe(0);
  selectWorkspace('arrea');expect((await state()).assignments[0].completed).toBe(1);
 });
 it('exporta e importa documentos, notas y originales y rechaza copias incompletas sin sustituir la práctica',async()=>{
  await create();const document=(await state()).documents[0];await post({action:'classify',id:document.id,revision:1,category:'banco',status:'en-curso',notes:'Revisar vencimiento'});const backup=await createBackup();
  selectWorkspace('decasarre');await restoreBackup(backup);expect((await state()).documents.find((file:any)=>file.id===document.id)).toMatchObject({category:'banco',status:'en-curso',notes:'Revisar vencimiento'});expect((await allFiles()).size).toBe(2);
  const missing=structuredClone(backup);missing.files.pop();await expect(restoreBackup(missing)).rejects.toThrow('documento del encargo');expect((await state()).documents).toHaveLength(2);
  const badSize=structuredClone(backup);badSize.files[0].data=btoa('incorrecto');await expect(restoreBackup(badSize)).rejects.toThrow('tamaño');expect((await allFiles()).size).toBe(2);
  const badLink=structuredClone(backup),table=badLink.tables.documentation_files;table.rows[0][table.columns.indexOf('assignment_id')]=crypto.randomUUID();await expect(restoreBackup(badLink)).rejects.toThrow();
 });
 it('abre bases antiguas de forma aditiva y restaura las copias sin bandeja',async()=>{
  const old=await freshDatabase();old.run('DROP TABLE documentation_files');old.run('DROP TABLE documentation_assignments');const bytes=old.export();old.close();await persistDatabase(bytes);
  expect((await state()).documents).toEqual([]);expect(await readStore('state','database')).toEqual(bytes);
  const backup=await createBackup();delete backup.tables.documentation_assignments;delete backup.tables.documentation_files;await create();await restoreBackup(backup);expect((await state()).assignments).toEqual([]);
 });
 it('rechaza escrituras obsoletas y entradas inválidas sin conservar cambios parciales',async()=>{
  await create();const document=(await state()).documents[0],data={action:'classify',id:document.id,revision:1,category:'compra',status:'completado',notes:''};
  await post(data);await post({...data,notes:'Una edición anterior'},409);await post({...data,revision:2,category:'__proto__'},400);
  expect((await state()).documents.find((file:any)=>file.id===document.id).revision).toBe(2);
  const form=new FormData();form.set('assignment',JSON.stringify({action:'create',id:crypto.randomUUID(),title:'No debe guardarse',period:'',instructions:''}));form.append('files',new File(['script'],'archivo.html'));expect((await localRequest('/api/documentacion',{method:'POST',body:form})).status).toBe(400);expect((await state()).assignments).toHaveLength(1);expect((await allFiles()).size).toBe(2);
 });
 it('añade y mezcla archivos conservando el progreso y comprueba límites antes de escribir',async()=>{
  const id=await create(),file=(await state()).documents[0];await post({action:'classify',id:file.id,revision:1,category:'laboral',status:'completado',notes:'Hecho'});
  const form=new FormData();form.set('assignment',JSON.stringify({action:'edit',id,revision:1,title:'Encargo actualizado',period:'1T',instructions:'Nuevas instrucciones'}));form.append('files',new File(['Recibo'],'recibo.txt'));expect((await localRequest('/api/documentacion',{method:'POST',body:form})).status).toBe(200);
  await post({action:'shuffle',id,revision:2});const result=await state();expect(result.assignments[0]).toMatchObject({title:'Encargo actualizado',total:3,completed:1,revision:3});expect(result.documents.find((item:any)=>item.id===file.id)).toMatchObject({notes:'Hecho',category:'laboral',status:'completado'});expect(result.documents.map((item:any)=>item.position)).toEqual([0,1,2]);
  const over=new FormData();over.set('assignment',JSON.stringify({action:'edit',id,revision:3,title:'No guardar',period:'',instructions:''}));over.append('files',new File([new Uint8Array(8*1024*1024+1)],'grande.pdf'));expect((await localRequest('/api/documentacion',{method:'POST',body:over})).status).toBe(400);expect((await state()).assignments[0].title).toBe('Encargo actualizado');
 });
 it('borra un documento o un encargo con sus archivos y respeta otras empresas',async()=>{
  const first=await create(),second=await create(),file=(await state()).documents.find((item:any)=>item.assignment_id===first);selectWorkspace('decasarre');await create();selectWorkspace('arrea');
  await erase('document',file.id);expect((await allFiles()).size).toBe(3);expect((await state()).assignments.find((item:any)=>item.id===first).total).toBe(1);
  await erase('documentation',first);expect((await allFiles()).size).toBe(2);expect((await state()).assignments.map((item:any)=>item.id)).toEqual([second]);
  await erase('all');expect((await allFiles()).size).toBe(0);expect((await state()).assignments).toEqual([]);
  selectWorkspace('decasarre');expect((await state()).assignments).toHaveLength(1);expect((await allFiles()).size).toBe(2);
 });
});
