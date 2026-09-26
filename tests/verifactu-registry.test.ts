import {beforeAll,beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import initSqlJs,{type Database,type SqlJsStatic} from 'sql.js';
import {indexedDB} from 'fake-indexeddb';
import schema from '../services/verifactu-registry/migrations/0001_registry.sql?raw';
import worker,{type RegistryDatabase} from '../services/verifactu-registry/worker';
import {blankInvoice,practiceSignature,digest,type Invoice} from '../lib/verifactu/model';
import {publicEvent,registryState,syncRegistry,lookupRegistry} from '../lib/verifactu/registry';
import {saveDraft,issueInvoice,remedyInvoice,listRecords,qrUrl} from '../lib/verifactu/store';
import {setEngineForTests,freshDatabase,persistDatabase} from '../lib/local/runtime';
import {getProfile} from '../lib/local/profile';
import {selectWorkspace} from '../lib/local/workspaces';
import {createBackup,restoreBackup} from '../lib/local/backup';

function storage(){const data:Record<string,any>={};Object.defineProperties(data,{getItem:{value:(key:string)=>data[key]??null},setItem:{value:(key:string,value:string)=>{data[key]=String(value);}},removeItem:{value:(key:string)=>{delete data[key];}}});return data;}
Object.assign(globalThis,{indexedDB,localStorage:storage(),sessionStorage:storage()});
let SQL:SqlJsStatic,db:Database,api:RegistryDatabase;
const origin='https://simulacion.sandramangas.com',url='https://registry.example.test';
const env=()=>({DB:api,ALLOWED_ORIGINS:origin});
function adapter(db:Database):RegistryDatabase{
 function prepare(sql:string,args:(string|number)[]=[]):any{return {bind:(...values:(string|number)[])=>prepare(sql,values),first:async()=>{const s=db.prepare(sql);try{s.bind(args);return s.step()?s.getAsObject():null;}finally{s.free();}},run:async()=>run(sql,args),execute:()=>run(sql,args)};}
 function run(sql:string,args:(string|number)[]){db.run(sql,args);return {meta:{changes:db.getRowsModified()}};}
 return {prepare,batch:async statements=>{db.run('BEGIN');try{const results=statements.map((s:any)=>s.execute());db.run('COMMIT');return results;}catch(e){db.run('ROLLBACK');throw e;}}};
}
async function route(input:any,init?:RequestInit){const address=String(input);if(address.endsWith('/verifactu-registry.json'))return Response.json({version:1,url});const r=new Request(address,init);r.headers.set('Origin',origin);return worker.fetch(r,env());}
const count=()=>Number(db.exec('SELECT COUNT(*) FROM registry_records')[0].values[0][0]);
function invoice(number='001'):Invoice{const i=blankInvoice(getProfile());Object.assign(i,{number,date:'2026-10-12',reviewed:true});i.issuer.address='Domicilio ficticio';i.customer={name:'Cliente privado en el PDF',nif:'B12345674',address:'Domicilio privado',contact:'correo@cliente.test'};i.lines=[{code:'UNO',description:'Concepto del PDF',quantity:1,price:100,discount:0}];i.taxes=[{gross:100,discount:0,rate:21,quota:21}];return i;}
async function emit(i=invoice(),scenario:'normal'|'warning'|'rejected'='normal'){const draft=await saveDraft(i);return {i,record:await issueInvoice(i.id,draft.revision,scenario,practiceSignature(i))};}
async function identity(){const b=await createBackup(),t=b.tables.vf_registry;return Object.fromEntries(t.columns.map((c,n)=>[c,t.rows[0][n]])) as {practice_id:string;write_key:string};}
async function post(practiceId:string,key:string,value:unknown){return worker.fetch(new Request(`${url}/v1/practices/${practiceId}/records`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Authorization:'Bearer '+key},body:JSON.stringify(value)}),env());}
beforeAll(async()=>{SQL=await initSqlJs();setEngineForTests(SQL);});
beforeEach(async()=>{for(const key of Object.keys(localStorage))localStorage.removeItem(key);selectWorkspace('decasarre');const fresh=await freshDatabase();for(const id of ['arrea','decasarre'])await persistDatabase(fresh.export(),{replaceFiles:true},id);fresh.close();db=new SQL.Database();db.run(schema);api=adapter(db);vi.stubGlobal('fetch',vi.fn(route));});
afterEach(()=>{db.close();vi.unstubAllGlobals();});

describe('Registro compartido de la simulación',()=>{
 it('publica solo metadatos y permite el cotejo sin credenciales ni práctica local',async()=>{
  const {i}=await emit(),state=await syncRegistry();expect(state?.pending).toBe(0);expect(count()).toBe(1);
  const result=await lookupRegistry(state!.practiceId,i.id),owner=await identity();
  expect(result.invoice).toEqual({id:i.id,nif:i.issuer.nif,number:'FV26/001',date:i.date,total:'121.00'});expect(result.signed).toBe(true);expect(result.status).toBe('Correcto');
  expect(JSON.stringify(result)).not.toContain(owner.write_key);expect(JSON.stringify(result)).not.toContain(i.customer.name);expect(JSON.stringify(result)).not.toContain(i.iban);
  expect(qrUrl(i,origin,owner.practice_id)).not.toContain(owner.write_key);
  selectWorkspace('arrea');expect(await listRecords()).toHaveLength(0);expect((await lookupRegistry(state!.practiceId,i.id)).recordId).toBe(result.recordId);
 });
 it('requiere la credencial de la práctica y rechaza reemplazos de registros ya recibidos',async()=>{
  const {record}=await emit();await syncRegistry();const owner=await identity(),event=publicEvent(record);
  expect((await post(owner.practice_id,'0'.repeat(64),event)).status).toBe(403);
  expect((await post(owner.practice_id,owner.write_key,{...event,invoice:{...event.invoice,total:'999.00'}})).status).toBe(409);
  expect((await post(owner.practice_id,owner.write_key,event)).status).toBe(200);expect(count()).toBe(1);
 });
 it('reintenta sin duplicar cuando el servidor recibió el registro pero se perdió la respuesta',async()=>{
  await emit();let fail=true;
  vi.stubGlobal('fetch',vi.fn(async(input:any,init?:RequestInit)=>{const r=await route(input,init);if(init?.method==='POST'&&fail){fail=false;throw Error('Conexión interrumpida');}return r;}));
  await expect(syncRegistry()).rejects.toThrow('contactar');expect(count()).toBe(1);expect((await registryState()).pending).toBe(1);
  await syncRegistry();expect((await registryState()).pending).toBe(0);expect(count()).toBe(1);
 });
 it('mantiene el estado de rechazo, subsanación y anulación visible desde otro navegador',async()=>{
  const {i,record}=await emit(invoice(),'rejected');const state=await syncRegistry();expect((await lookupRegistry(state!.practiceId,i.id)).status).toBe('Incorrecto');
  const corrected=await remedyInvoice(i.id,'subsanacion','Clasificación revisada',record.id,practiceSignature(i));await syncRegistry();expect((await lookupRegistry(state!.practiceId,i.id)).status).toBe('Correcto');
  await remedyInvoice(i.id,'anulacion','Operación inexistente',corrected.id,practiceSignature(i));await syncRegistry();expect((await lookupRegistry(state!.practiceId,i.id)).kind).toBe('anulacion');expect(count()).toBe(3);
 });
 it('separa dos copias del mismo ejercicio, incluso con las mismas facturas e identificadores',async()=>{
  const {i}=await emit();const first=await syncRegistry(),ownCopy=await createBackup(),template=await createBackup({template:true});expect(template.tables.vf_registry.rows).toEqual([]);expect(ownCopy.tables.vf_registry.rows).toHaveLength(1);
  await restoreBackup(ownCopy);expect((await registryState()).practiceId).toBe('');const second=await syncRegistry();expect(second!.practiceId).not.toBe(first!.practiceId);
  const last=(await listRecords()).at(-1)!;await remedyInvoice(i.id,'anulacion','Otro supuesto',last.id,practiceSignature(i));await syncRegistry();
  expect((await lookupRegistry(first!.practiceId,i.id)).kind).toBe('alta');expect((await lookupRegistry(second!.practiceId,i.id)).kind).toBe('anulacion');
  expect(count()).toBe(3);
 });
 it('permite continuar una copia propia y detecta un historial remoto más reciente',async()=>{
  const {i,record}=await emit();const original=await syncRegistry(),copy=await createBackup();
  await restoreBackup(copy,undefined,{registry:'continue'});expect((await registryState()).practiceId).toBe(original!.practiceId);
  await remedyInvoice(i.id,'anulacion','Emisión errónea',record.id,practiceSignature(i));await syncRegistry();expect(count()).toBe(2);
  await restoreBackup(copy,undefined,{registry:'continue'});await remedyInvoice(i.id,'anulacion','Otra modificación desde copia antigua',record.id,practiceSignature(i));
  await expect(syncRegistry()).rejects.toThrow('historial compartido');expect(count()).toBe(2);expect((await registryState()).pending).toBe(1);
 });
 it('protege las copias frente a credenciales manipuladas y conserva la compatibilidad anterior',async()=>{
  await emit();await syncRegistry();const copy=await createBackup(),bad=structuredClone(copy),table=bad.tables.vf_registry;table.rows[0][table.columns.indexOf('write_key')]='f'.repeat(64);
  await expect(restoreBackup(bad,undefined,{registry:'continue'})).rejects.toThrow('identificación');expect((await createBackup()).tables).toEqual(copy.tables);
  delete copy.tables.vf_registry;await restoreBackup(copy);expect((await registryState()).practiceId).toBe('');expect(await listRecords()).toHaveLength(1);
 });
 it('resuelve envíos simultáneos con un solo registro y no sobrepasa el límite global',async()=>{
  const {record}=await emit(),event=publicEvent(record),key='a'.repeat(64),pid=digest('aula-verifactu-practice-v1:'+key);
  const results=await Promise.all([post(pid,key,event),post(pid,key,event)]);expect(results.every(r=>r.status===200)).toBe(true);expect(count()).toBe(1);expect(db.exec('SELECT records FROM registry_quota')[0].values[0][0]).toBe(1);
  db.run('UPDATE registry_quota SET records=100000');const next={...event,id:crypto.randomUUID(),invoice:{...event.invoice,id:crypto.randomUUID(),number:'FV26/002'},previousHash:event.hash,hash:'B'.repeat(64)};
  expect((await post(pid,key,next)).status).toBe(503);expect(count()).toBe(1);
 });
 it('rechaza orígenes ajenos y rutas o cuerpos no válidos',async()=>{
  const r=await worker.fetch(new Request(url+'/health',{headers:{Origin:'https://otro.test'}}),env());expect(r.status).toBe(403);expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  const allowed=await worker.fetch(new Request(url+'/health',{headers:{Origin:origin}}),env());expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  const key='b'.repeat(64),pid=digest('aula-verifactu-practice-v1:'+key);expect((await post(pid,key,{huge:'x'.repeat(9000)})).status).toBe(413);
  expect((await post(pid,key,{})).status).toBe(400);expect(count()).toBe(0);
 });
});
