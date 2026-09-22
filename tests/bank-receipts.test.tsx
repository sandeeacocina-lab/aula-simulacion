import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
function storage(){const d:Record<string,any>={};Object.defineProperties(d,{getItem:{value:(k:string)=>d[k]??null},setItem:{value:(k:string,v:string)=>{d[k]=String(v);}},removeItem:{value:(k:string)=>{delete d[k];}}});return d;}
Object.assign(globalThis,{indexedDB,localStorage:storage(),sessionStorage:storage()});
const {setEngineForTests,freshDatabase,readDatabase,persistDatabase,runLocal,env}=await import('../lib/local/runtime');
const {localRequest}=await import('../lib/local/dispatch');
const {createBackup,restoreBackup}=await import('../lib/local/backup');
const {selectWorkspace}=await import('../lib/local/workspaces');
const {getProfile,saveProfile}=await import('../lib/local/profile');
const {Receipt}=await import('../components/bank/receipt');
const uid=()=>crypto.randomUUID();
async function post(path:string,data:Record<string,unknown>,status=200){const r=await localRequest('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),d=await r.json();expect(r.status,JSON.stringify(d)).toBe(status);return d;}
async function get(query=''){const r=await localRequest('/api/banco'+query);expect(r.status).toBe(200);return r.json();}
async function ready(p:Record<string,unknown>,family='manual'){const v=await post('banco/operaciones',{...p,action:family+'-preview'});return {...p,action:family+'-execute',fingerprint:v.fingerprint,revision:v.account.revision,consent:true,warningsAccepted:true};}
async function operation(p:Record<string,unknown>,family='manual'){return post('banco/operaciones',await ready(p,family),201);}
const manual=(kind:string,extra:Record<string,unknown>={})=>({id:uid(),kind,amount:'100',bookingDate:'2026-09-22',concept:'Liquidación del supuesto',...extra});
function receiptHtml(name:string,data:any){const html=renderToStaticMarkup(<Receipt data={data}/>);const dir=process.env.BANK_RECEIPT_QA_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name+'.html'),html);}return html;}
beforeAll(async()=>{setEngineForTests(await initSqlJs());});
beforeEach(async()=>{selectWorkspace('arrea');for(const k of Object.keys(localStorage))localStorage.removeItem(k);const db=await freshDatabase();await persistDatabase(db.export(),{replaceFiles:true});db.close();await post('banco',{action:'setup',id:uid(),amount:'10000',iban:getProfile().iban,bookingDate:'2026-01-01',consent:true},201);});

describe('Justificantes bancarios con desglose',()=>{
 it('carga base más IVA, mantiene las comisiones exentas y conserva el detalle en copias y reintentos',async()=>{
  const request=await ready(manual('fee',{vatMode:'taxable',vatRate:'21',reference:'COM-2026-09'}));
  const fee=await post('banco/operaciones',request,201),detail=fee.batch.receiptDetails;
  expect(fee.batch.delta).toBe(-12100);expect(fee.items[0].amount).toBe(12100);
  expect(detail.breakdown).toMatchObject({base:10000,vatMode:'taxable',vatRate:21,vat:2100,total:12100});
  const balance=(await get()).account.balance;await post('banco/operaciones',request);expect((await get()).account.balance).toBe(balance);
  const exempt=await operation(manual('fee'));expect(exempt.batch.delta).toBe(-10000);expect(exempt.batch.receiptDetails.breakdown.vatMode).toBe('exempt');
  const small=await operation(manual('fee',{amount:'0.03',vatMode:'taxable',vatRate:'21'}));expect(small.batch.delta).toBe(-4);
  const backup=await createBackup();await restoreBackup(backup);expect((await get('?batch='+fee.batch.id)).batch.receiptDetails).toEqual(detail);
  saveProfile({...getProfile(),name:'Otro nombre posterior',nif:'B00000000'});const recovered=await get('?batch='+fee.batch.id);expect(recovered.batch.receiptDetails.holder).toEqual(detail.holder);
  const html=receiptHtml('comision-iva',recovered);expect(html).toContain('Base imponible de la comisión');expect(html).toContain('COM-2026-09');expect(html).toContain('B47425400');expect(html).not.toContain('Otro nombre posterior');
 });
 it('abona intereses netos de retención y rechaza porcentajes o periodos incoherentes',async()=>{
  const interest=await operation(manual('interest',{periodFrom:'2026-07-01',periodTo:'2026-09-21'}));
  expect(interest.batch.delta).toBe(8100);expect(interest.items[0].amount).toBe(8100);expect(interest.batch.receiptDetails.breakdown).toMatchObject({gross:10000,withholdingRate:19,withholding:1900,net:8100});
  const html=receiptHtml('intereses',interest);expect(html).toContain('Intereses brutos');expect(html).toContain('Retención a cuenta (19 %)');expect(html).toContain('01/07/2026 al 21/09/2026');
  expect((await operation(manual('interest',{amount:'12.35',withholdingRate:'19,5'}))).batch.delta).toBe(994);
  expect((await operation(manual('interest',{withholdingRate:'0'}))).batch.delta).toBe(10000);
  for(const extra of [{withholdingRate:'-1'},{withholdingRate:'101'},{withholdingRate:'NaN'},{periodFrom:'2026-07-01'},{periodFrom:'2026-09-01',periodTo:'2026-08-01'},{periodFrom:'2026-09-01',periodTo:'2026-10-01'}])await post('banco/operaciones',{...manual('interest',extra),action:'manual-preview'},400);
  await post('banco/operaciones',{...manual('fee',{vatMode:'taxable',vatRate:'101'}),action:'manual-preview'},400);
  selectWorkspace('decasarre');const r=await localRequest('/api/banco?batch='+interest.batch.id);expect(r.status).toBe(404);selectWorkspace('arrea');
 });
 it('muestra capital, intereses, vencimiento y pendiente sin recalcular las cuotas antiguas',async()=>{
  const loan={id:uid(),kind:'loan',title:'Equipamiento para eventos',amount:'12000',months:'12',tin:'6',bookingDate:'2026-01-01',firstDate:'2026-02-01'};
  const financing=await operation(loan,'finance');const payment=await operation({id:uid(),productId:loan.id,installment:1,bookingDate:'2026-02-02'},'installment');
  const d=payment.batch.receiptDetails.breakdown;expect(d).toMatchObject({principal:97280,interest:6000,vat:0,total:103280,balanceBefore:1200000,balanceAfter:1102720,tin:6,dueDate:'2026-02-01',number:1});expect(payment.batch.delta).toBe(-103280);
  const html=receiptHtml('cuota-prestamo',payment);for(const text of ['Capital amortizado','Intereses de la cuota','Capital pendiente después de esta cuota','1 de 12','01/02/2026',loan.id])expect(html).toContain(text);
  await runLocal(async()=>{await env.DB.prepare("UPDATE bank_batches SET receipt_details='null' WHERE id=?").bind(payment.batch.id).run();return Response.json({ok:true});});
  expect((await get('?batch='+payment.batch.id)).batch.receiptDetails.breakdown).toEqual(d);
  const last=financing.product.data.schedule.at(-1);expect(last.balance).toBe(0);
  const lease=await operation({...loan,id:uid(),kind:'leasing',vat:'21',residual:'1000'},'finance');
  const leasePayment=await operation({id:uid(),productId:lease.product.id,installment:1,bookingDate:'2026-02-01'},'installment'),l=leasePayment.batch.receiptDetails.breakdown;
  expect(l.principal+l.interest+l.vat).toBe(-leasePayment.batch.delta);expect(l.vat).toBe(Math.round((l.principal+l.interest)*0.21));receiptHtml('cuota-leasing',leasePayment);
 });
 it('abre bases de datos y copias antiguas sin añadir impuestos a sus movimientos',async()=>{
  const fee=await operation(manual('fee'));
  const db=await readDatabase();db.run('ALTER TABLE bank_batches DROP COLUMN receipt_details');await persistDatabase(db.export());db.close();
  const old=await get('?batch='+fee.batch.id);expect(old.batch.receiptDetails).toBe(null);expect(old.batch.delta).toBe(-10000);
  const backup=await createBackup(),table=backup.tables.bank_batches,i=table.columns.indexOf('receipt_details');table.columns.splice(i,1);table.rows.forEach(row=>row.splice(i,1));
  await restoreBackup(backup);expect((await get('?batch='+fee.batch.id)).batch.receiptDetails).toBe(null);expect((await get()).account.balance).toBe(990000);
 });
});
