import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {createRequire} from 'node:module';
import {DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {bankXml,contractXml} from './fixtures.mjs';
import {socialPdf} from './social-fixtures.mjs';
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url',()=>({default:createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')}));
vi.mock('pdfjs-dist',()=>import('pdfjs-dist/legacy/build/pdf.mjs'));
const localStorage:Record<string,string>&{getItem:any;setItem:any;removeItem:any}={} as any;
Object.defineProperties(localStorage,{getItem:{value:(k:string)=>localStorage[k]??null},setItem:{value:(k:string,v:string)=>{localStorage[k]=String(v);}},removeItem:{value:(k:string)=>{delete localStorage[k];}}});
Object.assign(globalThis,{indexedDB,localStorage,DOMMatrix,ImageData,Path2D});
const {setEngineForTests,freshDatabase,persistDatabase,readDatabase,allFiles,runLocal,env}=await import('../lib/local/runtime');
const {localRequest}=await import('../lib/local/dispatch');
const {createBackup,restoreBackup}=await import('../lib/local/backup');
const {saveProfile,getProfile}=await import('../lib/local/profile');
const {practiceStorage}=await import('../lib/local/storage');
const date='2026-09-20',uid=()=>crypto.randomUUID();
async function post(path:string,data:any,status=200){const r=await localRequest('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),d=await r.json();expect(r.status,JSON.stringify(d)).toBe(status);return d;}
async function get(path:string){const r=await localRequest('/api/'+path),d=await r.json();expect(r.status,JSON.stringify(d)).toBe(200);return d;}
async function erase(scope:string,id?:string){const p={scope,...(id?{id}:{})},v=await post('practicas',{...p,action:'preview'});return post('practicas',{...p,action:'delete',token:v.token,confirm:'BORRAR'});}
async function openBank(){return post('banco',{action:'setup',id:uid(),amount:'10000',iban:getProfile().iban,bookingDate:date,consent:true},201);}
const manual=(kind='transfer',amount='10.00')=>({id:uid(),kind,name:'Empresa ficticia',iban:'ES0000000000000000000000',amount,concept:'Factura de prácticas',reference:'FACTURA-PRUEBA',bookingDate:date});
async function readyOperation(p:any,family='manual'){const v=await post('banco/operaciones',{...p,action:family+'-preview'});return {...p,action:family+'-execute',revision:v.account.revision,fingerprint:v.fingerprint,consent:true,warningsAccepted:true};}
async function operation(p:any,family='manual'){return post('banco/operaciones',await readyOperation(p,family),201);}
async function sepe(xml=contractXml()){const file=Buffer.from(xml).toString('base64'),v=await post('sepe',{action:'preview',file,filename:'contratos.xml'});return {action:'register',file,filename:'contratos.xml',fingerprint:v.fingerprint,id:uid(),communicationDate:date,consent:true,warningsAccepted:true};}
beforeAll(async()=>{setEngineForTests(await initSqlJs());});
beforeEach(async()=>{const db=await freshDatabase();await persistDatabase(db.export(),{replaceFiles:true});db.close();for(const key of Object.keys(localStorage))delete localStorage[key];});
describe('Práctica estática, persistencia y aislamiento',()=>{
 it('presenta cada CCC de un PDF múltiple, conserva originales y no mezcla importes',async()=>{
  const files=['RNT','RLC'].map(kind=>({filename:kind+'.pdf',file:socialPdf(kind,{pages:[{ccc:'00000000901',deductions:true},{ccc:'00000000902'}]}).toString('base64')}));
  const first=await post('seguridad-social',{action:'preview',files});expect(first.liquidations).toHaveLength(2);expect(first.documents[1].total).toBe(1686);expect(first.documents[0].sourcePages).toEqual([1]);
  const register={action:'register',files,id:uid(),fingerprint:first.fingerprint,submissionDate:date,consent:true,warningsAccepted:true};
  await post('seguridad-social',register,400);
  const second=await post('seguridad-social',{action:'preview',files,liquidation:first.liquidations[1].id});expect(second.documents[1].total).toBe(111686);expect(second.documents[0].sourcePages).toEqual([2]);
  await post('seguridad-social',{...register,liquidation:second.selectedLiquidation},409);
  const a=await post('seguridad-social',{...register,liquidation:first.selectedLiquidation},201),b=await post('seguridad-social',{...register,id:uid(),liquidation:second.selectedLiquidation,fingerprint:second.fingerprint},201);
  expect(a.batch.ccc).toBe('00000000901');expect(b.batch.ccc).toBe('00000000902');expect((await get('seguridad-social')).total).toBe(2);
  const download=await localRequest('/api/seguridad-social?batch='+b.batch.id+'&pdf=RLC');expect(Buffer.from(await download.arrayBuffer())).toEqual(Buffer.from(files[1].file,'base64'));
  expect((await post('seguridad-social',{action:'preview',files})).duplicates).toHaveLength(2);
 });
 it.skipIf(!process.env.SOCIAL_MULTI_SAMPLE_DIR)('lee los dos PDF aportados sin registrar la revisión',async()=>{
  const {readFileSync}=await import('node:fs'),{resolve}=await import('node:path');
  const files=['Relación nominal de trabajadores.pdf','Recibo de liquidación de cotizaciones.pdf'].map(filename=>({filename,file:readFileSync(resolve(process.env.SOCIAL_MULTI_SAMPLE_DIR!,filename)).toString('base64')}));
  const a=await post('seguridad-social',{action:'preview',files});expect(a.liquidations).toHaveLength(2);expect(a.documents[1].total).toBe(58134);expect(a.documents[0].header.workers).toBe(3);
  const b=await post('seguridad-social',{action:'preview',files,liquidation:a.liquidations[1].id});expect(b.documents[1].total).toBe(45952);expect(b.documents[0].header.workers).toBe(1);
  expect((await get('seguridad-social')).total).toBe(0);expect((await allFiles()).size).toBe(0);
 });

 it('ejecuta cobros, nóminas y pagos, rechaza duplicados y libera la referencia al borrar',async()=>{
  await openBank();const xml=bankXml(),before=await get('banco'),p=await post('banco',{action:'preview',xml,filename:'remesa.xml'});
  expect((await get('banco')).total).toBe(1);expect(p.parsed.total).toBe(3030);
  const request={action:'execute',id:uid(),xml,filename:'remesa.xml',bookingDate:date,consent:true,warningsAccepted:true,revision:before.account.revision};
  const paid=await post('banco',request,201);expect(paid.batch.after).toBe(996970);await post('banco',request);await post('banco',{...request,id:uid()},409);
  expect((await allFiles()).size).toBe(0);expect(paid.batch.hasXml).toBe(false);
  for(const type of ['collection','payroll']){const d=await post('banco',{...request,id:uid(),xml:bankXml({id:type,type}),revision:(await get('banco')).account.revision},201);expect(d.batch.kind).toBe(type);}
  await erase('bank',paid.batch.id);expect((await post('banco',{action:'preview',xml,filename:'repetida.xml'})).duplicateId).toBe(null);
  const db=await readDatabase();expect(db.exec('SELECT SUM(delta) FROM bank_movements')[0].values[0][0]).toBe((await get('banco')).account.balance);db.close();
 });
 it('no gasta dos veces un saldo revisado ni conserva cambios fallidos',async()=>{
  await openBank();const a=await readyOperation(manual()),b=await readyOperation(manual());
  const results=await Promise.all([a,b].map(body=>localRequest('/api/banco/operaciones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})));expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  const before=(await get('banco')).account.balance;await post('banco/operaciones',await readyOperation(manual('transfer','999999')),409);expect((await get('banco')).account.balance).toBe(before);
  await runLocal(async()=>{await env.DB.prepare('UPDATE bank_accounts SET balance=7').run();return Response.json({error:'abort'},{status:400});});expect((await get('banco')).account.balance).toBe(before);
 });
 it('tramita domiciliaciones, préstamos, cuotas y leasing con importes exactos',async()=>{
  await openBank();const m={action:'mandate-create',id:uid(),name:'Proveedor ficticio',iban:'ES0000000000000000000000',reference:'MANDATO-1',signedDate:'2026-01-01',direction:'out',consent:true,warningsAccepted:true};await post('banco/operaciones',m,201);await operation({...manual('direct_debit','50'),mandateId:m.id});
  const loan={id:uid(),kind:'loan',title:'Equipamiento',amount:'1200',months:'12',tin:'0',bookingDate:date,firstDate:'2026-10-31'};const r=await operation(loan,'finance');expect(r.product.data.schedule.reduce((n:number,x:any)=>n+x.principal,0)).toBe(120000);
  const payment={id:uid(),productId:loan.id,installment:1,bookingDate:'2026-10-31'};await operation(payment,'installment');await post('banco/operaciones',{...payment,id:uid(),action:'installment-preview'},409);await erase('bank',payment.id);expect((await get('banco/operaciones?product='+loan.id)).product.payments).toHaveLength(0);
  const before=(await get('banco')).account.balance,lease=await operation({...loan,id:uid(),kind:'leasing',amount:'1000',months:'3',residual:'100',vat:'21'},'finance');expect((await get('banco')).account.balance).toBe(before);expect(lease.product.data.schedule.at(-1).balance).toBe(0);
 });
 it('valida contratos XML, conserva todos los datos sin el XML y descarga PDF',async()=>{
  const request=await sepe();expect((await get('sepe')).total).toBe(0);const result=await post('sepe',request,201);expect(result.contracts[0].name).toBe('MARTA MUÑOZ PRUEBA');await post('sepe',{...request,id:uid()},409);
  expect((await allFiles()).size).toBe(0);const pdf=await localRequest('/api/sepe?batch='+request.id+'&pdf=1');expect(pdf.status).toBe(200);expect((await pdf.text()).slice(0,5)).toBe('%PDF-');
  await post('sepe',{action:'preview',file:Buffer.from('<broken').toString('base64'),filename:'roto.xml'},400);
  await erase('sepe');expect((await get('sepe')).total).toBe(0);await post('sepe',request,201);
 });
 it('inscribe empresas, afilia personas, registra altas y evita duplicaciones',async()=>{
  const company={name:'EMPRESA FICTICIA SL',nif:'B00000000',effectiveDate:'2026-01-01',address:'Calle de prácticas 1',postcode:'00000',city:'Municipio de prueba',province:'Provincia de prueba',activity:'Servicios',cnae:'8230',entity:'Entidad de prácticas'};
  const person={firstName:'Persona',lastName:'Ficticia',secondName:'Pruebas',documentType:'DNI',personId:'00000000T',birthDate:'2000-01-01',nationality:'Española',address:'Calle de pruebas 2',postcode:'00000',city:'Municipio de prueba',province:'Provincia de prueba',effectiveDate:'2026-01-02'};
  const register=async(kind:string,data:any)=>{const request={id:uid(),action:'preview',kind,data},p=await post('seguridad-social/registro',request);return post('seguridad-social/registro',{...request,action:'register',fingerprint:p.fingerprint,consent:true},201);};
  const c=await register('company',company),p=await register('person',person);await register('employment',{companyId:c.record.id,personId:p.record.id,effectiveDate:'2026-01-03',contract:'100',group:'7',percent:'100',occupation:'Administración'});
  expect((await get('seguridad-social/registro')).total).toBe(3);await post('seguridad-social/registro',{id:uid(),action:'preview',kind:'company',data:company},409);
  await erase('registry',c.record.id);expect((await get('seguridad-social/registro')).total).toBe(1);
 });
 it('extrae RNT y RLC, rechaza incoherencias y no modifica la banca al borrar cotización',async()=>{
  await openBank();const account=(await get('banco')).account;
  const files=['RNT','RLC'].map(kind=>({filename:kind+'.pdf',file:socialPdf(kind).toString('base64')}));
  const p=await post('seguridad-social',{action:'preview',files});expect(p.documents[0].header.workers).toBe(2);expect(p.documents[1].total).toBe(111686);expect((await allFiles()).size).toBe(0);
  const req={action:'register',id:uid(),files,fingerprint:p.fingerprint,submissionDate:date,consent:true,warningsAccepted:true};await post('seguridad-social',req,201);await post('seguridad-social',{...req,id:uid()},409);
  expect((await allFiles()).size).toBe(2);const pdf=await localRequest('/api/seguridad-social?batch='+req.id+'&receipt=pdf');expect((await pdf.text()).startsWith('%PDF-')).toBe(true);
  await post('seguridad-social',{action:'preview',files:[{filename:'mala.pdf',file:socialPdf('RLC',{badTotal:true}).toString('base64')}]},400);
  await erase('social');expect((await get('banco')).account).toEqual(account);expect((await allFiles()).size).toBe(0);
 });
 it('recibe y responde correos con adjuntos, firma y exportación, y permite marcar no leído',async()=>{
  const incoming={id:uid(),action:'receive',senderName:'Cliente ficticio',senderAddress:'cliente@correo.es',subject:'Presupuesto',body:'Solicito información.',consent:true,attachmentIds:[]};const form=new FormData();form.set('message',JSON.stringify(incoming));form.append('files',new File(['<factura>prueba</factura>'],'factura.xml',{type:'application/xml'}));
  const response=await localRequest('/api/correo',{method:'POST',body:form}),received=await response.json();expect(response.status,JSON.stringify(received)).toBe(201);expect(received.message.attachments).toHaveLength(1);
  await post('correo',{action:'read',id:incoming.id,isRead:true});expect((await get('correo')).unread).toBe(0);await post('correo',{action:'read',id:incoming.id,isRead:false});expect((await get('correo')).unread).toBe(1);
  const reply={action:'send',id:uid(),senderName:'Ana Apellidos',recipient:incoming.senderAddress,subject:'Re: Presupuesto',body:'Adjunto nuestra propuesta.',replyTo:incoming.id,consent:true};const sent=await post('correo',reply,201);expect(sent.message.senderAddress).toBe(getProfile().mailbox);expect((await get('correo?folder=sent')).total).toBe(1);
  const attachment=received.message.attachments[0],file=await localRequest('/api/correo/adjuntos?message='+incoming.id+'&file='+attachment.id);expect(await file.text()).toContain('<factura>');
  const eml=await localRequest('/api/correo/exportar?id='+incoming.id+'&format=eml');expect((await eml.text())).toContain('filename*0*=UTF-8');const pdf=await localRequest('/api/correo/exportar?id='+reply.id+'&format=pdf');expect((await pdf.text()).startsWith('%PDF-')).toBe(true);
 });
 it('restaura registros, ajustes, borradores y adjuntos sin tocar otras aplicaciones',async()=>{
  await openBank();await post('sepe',await sepe(),201);saveProfile({...getProfile(),name:'Empresa del ejercicio',shortName:'Ejercicio'});practiceStorage.setItem('aula-borrador-303',JSON.stringify({model:'303',company:'Ejercicio',values:{}}));localStorage.setItem('otra-web','no modificar');
  const form=new FormData();form.set('message',JSON.stringify({id:uid(),action:'receive',senderName:'Proveedor',senderAddress:'p@example.test',subject:'Factura',body:'Factura de prácticas',consent:true,attachmentIds:[]}));form.append('files',new File(['contenido de prueba'],'prueba.txt'));expect((await localRequest('/api/correo',{method:'POST',body:form})).status).toBe(201);
  const backup=await createBackup(),balance=(await get('banco')).account.balance;await erase('all');expect((await get('banco')).account).toBe(null);expect((await allFiles()).size).toBe(0);
  await restoreBackup(backup);expect((await get('banco')).account.balance).toBe(balance);expect((await get('sepe')).total).toBe(1);expect((await get('correo')).total).toBe(1);expect((await allFiles()).size).toBe(1);expect(getProfile().name).toBe('Empresa del ejercicio');expect(localStorage.getItem('otra-web')).toBe('no modificar');
  const broken=structuredClone(backup);broken.tables.bank_accounts.columns[0]='injection';await expect(restoreBackup(broken)).rejects.toThrow();expect((await get('banco')).account.balance).toBe(balance);
  const missing=structuredClone(backup);missing.files=[];await expect(restoreBackup(missing)).rejects.toThrow('adjunto');expect((await get('correo')).total).toBe(1);
 });
});
