import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {indexedDB,IDBDatabase,IDBFactory} from 'fake-indexeddb';
import initSqlJs from 'sql.js';

function browserStorage(){
 const data:Record<string,any>={};
 Object.defineProperties(data,{
  getItem:{value:(key:string)=>data[key]??null},
  setItem:{value:(key:string,value:string)=>{data[key]=String(value);}},
  removeItem:{value:(key:string)=>{delete data[key];}},
  clear:{value:()=>{for(const key of Object.keys(data))delete data[key];}},
 });return data as Storage;
}
const local=browserStorage();
Object.assign(globalThis,{indexedDB,localStorage:local,sessionStorage:browserStorage()});
const {allFiles,env,freshDatabase,hasLegacyPractice,persistDatabase,readDatabase,readStore,runLocal,setEngineForTests,workspaceDatabaseName}=await import('../lib/local/runtime');
const {createBackup,restoreBackup}=await import('../lib/local/backup');
const {BUILTIN_PROFILES,DEFAULT_PROFILE,getProfile,saveProfile,validateProfile}=await import('../lib/local/profile');
const {practiceStorage,storageSnapshot,workspaceStorage,WORKSPACE_SESSION_KEY}=await import('../lib/local/storage');
const {createWorkspace,getWorkspaceId,initializeWorkspaces,listWorkspaces,selectWorkspace}=await import('../lib/local/workspaces');
const attachmentKey='mail/demo/shared/attachment.txt';
const signature={name:'Ana Pruebas',role:'Administración',organization:'Empresa ficticia',email:'ana@empresa.test',phone:'',website:'https://empresa.test/',location:'Valladolid',color:'#a90045'};

async function seed(label:string,balance=10000){
 const response=await runLocal(async()=>{
  await env.DB.prepare('INSERT INTO bank_accounts (id,name,iban,balance,revision,created_at) VALUES (?,?,?,?,?,?)').bind('demo',label,getProfile().iban,balance,1,'2026-09-21').run();
  await env.DB.prepare('INSERT INTO mail_messages (id,company_id,sender_name,sender_address,recipient,subject,body,source,folder,home_folder,is_read,revision,created_at,updated_at,attachments,corporate_signature) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('shared-message','demo',label,'cliente@empresa.test',getProfile().mailbox,label,'Cuerpo original\n\nSin modificar.','manual','inbox','inbox',0,1,'2026-09-21','2026-09-21',JSON.stringify([{id:'attachment',key:attachmentKey,name:'attachment.txt'}]),JSON.stringify(signature)).run();
  await env.BUCKET.put(attachmentKey,new TextEncoder().encode(label),{httpMetadata:{contentType:'text/plain'}});
  practiceStorage.setItem('aula-borrador-303',JSON.stringify({company:label,values:{'07':String(balance)}}));
  practiceStorage.setItem('mail-signature-name',label);
  return Response.json({ok:true});
 });expect(response.ok).toBe(true);
}
async function accountName(id?:string){const db=await readDatabase(id);try{return db.exec('SELECT name FROM bank_accounts')[0]?.values[0]?.[0]??null;}finally{db.close();}}
async function fileText(id?:string){const files=await allFiles(id);return files.has(attachmentKey)?new TextDecoder().decode(files.get(attachmentKey)!.bytes):null;}
beforeAll(async()=>{setEngineForTests(await initSqlJs());});
beforeEach(async()=>{
 local.clear();Object.assign(globalThis,{sessionStorage:browserStorage()});
 const db=await freshDatabase();try{for(const id of ['legacy','arrea','decasarre'])await persistDatabase(db.export(),{replaceFiles:true},id);}finally{db.close();}
});
afterEach(()=>vi.restoreAllMocks());

describe('Empresas locales independientes',()=>{
 it('no crea la base de datos antigua al inspeccionar un navegador nuevo',async()=>{
  const empty=new IDBFactory();Object.assign(globalThis,{indexedDB:empty});
  try{expect(await empty.databases()).toEqual([]);await initializeWorkspaces();expect(await empty.databases()).toEqual([]);expect(getWorkspaceId()).toBe('arrea');expect(listWorkspaces()).toHaveLength(2);}
  finally{Object.assign(globalThis,{indexedDB});}
 });

 it('ofrece las dos empresas exactas y limpias sin fabricar una práctica anterior',async()=>{
  await initializeWorkspaces();
  expect(listWorkspaces().map(({id,kind})=>({id,kind}))).toEqual([{id:'arrea',kind:'arrea'},{id:'decasarre',kind:'decasarre'}]);
  expect(getWorkspaceId()).toBe('arrea');expect(getProfile()).toEqual(BUILTIN_PROFILES.arrea);
  selectWorkspace('decasarre');expect(getProfile()).toEqual(BUILTIN_PROFILES.decasarre);
  expect(getProfile().id).toBe('demo');expect(getProfile().legalName).toBe('DECASARRE, S.A.S.');
  expect(await accountName()).toBeNull();expect((await allFiles()).size).toBe(0);
  const backup=await createBackup();expect(Object.values(backup.tables).every(table=>table.rows.length===0)).toBe(true);
  expect(JSON.parse(backup.storage.profile)).toEqual(BUILTIN_PROFILES.decasarre);
  expect(await hasLegacyPractice()).toBe(false);
  expect(local.getItem(WORKSPACE_SESSION_KEY)).toBeNull();
 });

 it('conserva la base y claves antiguas y muestra la práctica anterior sin copiarla a las empresas',async()=>{
  // Uninitialized clients still address the exact original v1 namespace.
  await seed('Práctica anterior');saveProfile({...DEFAULT_PROFILE,name:'Mi práctica anterior'});
  local.setItem('otra-aplicacion','no modificar');
  const oldBytes=await readStore<Uint8Array>('state','database','legacy'),oldStorage=storageSnapshot('legacy');
  await initializeWorkspaces();expect(getWorkspaceId()).toBe('legacy');
  expect(listWorkspaces().find(workspace=>workspace.id==='legacy')?.profile.name).toBe('Mi práctica anterior');
  expect(await readStore('state','database','legacy')).toEqual(oldBytes);expect(storageSnapshot('legacy')).toEqual(oldStorage);
  for(const id of ['arrea','decasarre']){selectWorkspace(id);expect(await accountName()).toBeNull();expect(await fileText()).toBeNull();expect(practiceStorage.getItem('aula-borrador-303')).toBeNull();}
  selectWorkspace('legacy');expect(await accountName()).toBe('Práctica anterior');expect(await fileText()).toBe('Práctica anterior');
  expect(local.getItem('otra-aplicacion')).toBe('no modificar');
 });

 it('detecta una práctica anterior con solo registros, sin perfil ni borradores',async()=>{
  const db=await freshDatabase();db.run("INSERT INTO bank_accounts VALUES ('demo','Solo registros','ES9121000418450200051332',1000,1,'2026-09-21')");await persistDatabase(db.export(),{},'legacy');db.close();
  expect(workspaceStorage('legacy').keys()).toEqual([]);
  await initializeWorkspaces();expect(getWorkspaceId()).toBe('legacy');expect(await accountName()).toBe('Solo registros');
 });

 it('aísla cuentas, correo, adjuntos, fiscalidad y perfiles de empresas incorporadas y propias',async()=>{
  await initializeWorkspaces();await seed('ARREA',11000);
  selectWorkspace('decasarre');await seed('DECASARRE',22000);
  const custom=createWorkspace({...DEFAULT_PROFILE,name:'Tercera Empresa',legalName:'Tercera Empresa, S.L.',shortName:'TERCERA',accent:'#123456',website:'https://tercera.test'});
  expect(custom.id).toMatch(/^custom-/);expect(getWorkspaceId()).toBe('decasarre');
  selectWorkspace(custom.id);expect(getProfile().id).toBe('demo');expect(await accountName()).toBeNull();await seed('TERCERA',33000);
  saveProfile({...getProfile(),activity:'Actividad propia'});
  for(const [id,label,balance] of [['arrea','ARREA',11000],['decasarre','DECASARRE',22000],[custom.id,'TERCERA',33000]] as const){
   selectWorkspace(id);expect(await accountName()).toBe(label);expect(await fileText()).toBe(label);
   expect(JSON.parse(practiceStorage.getItem('aula-borrador-303')!).values['07']).toBe(String(balance));
   expect(practiceStorage.getItem('mail-signature-name')).toBe(label);
   const backup=await createBackup();expect(backup.tables.mail_messages.rows).toHaveLength(1);
   expect(backup.files).toHaveLength(1);expect(backup.storage).not.toHaveProperty(WORKSPACE_SESSION_KEY);
  }
  expect(getProfile('arrea')).toEqual(BUILTIN_PROFILES.arrea);expect(getProfile(custom.id).activity).toBe('Actividad propia');
  expect(listWorkspaces().map(workspace=>workspace.kind)).toEqual(['arrea','decasarre','custom']);
 });

 it('mantiene una selección distinta por pestaña sin escribirla en localStorage',async()=>{
  await initializeWorkspaces();const firstTab=globalThis.sessionStorage;selectWorkspace('decasarre');
  const secondTab=browserStorage();Object.assign(globalThis,{sessionStorage:secondTab});await initializeWorkspaces();expect(getWorkspaceId()).toBe('arrea');
  Object.assign(globalThis,{sessionStorage:firstTab});expect(getWorkspaceId()).toBe('decasarre');
  expect(local.getItem(WORKSPACE_SESSION_KEY)).toBeNull();
  expect(()=>selectWorkspace('missing')).toThrow('no existe');
 });

 it('abre la empresa explícita de un enlace sin sesión heredada ni cambios en otras pestañas',async()=>{
  await initializeWorkspaces('arrea');const firstTab=globalThis.sessionStorage;
  const receiptTab=browserStorage();Object.assign(globalThis,{sessionStorage:receiptTab});
  expect(receiptTab.getItem(WORKSPACE_SESSION_KEY)).toBeNull();await initializeWorkspaces('decasarre');
  expect(getWorkspaceId()).toBe('decasarre');expect(getProfile()).toEqual(BUILTIN_PROFILES.decasarre);
  expect(local.getItem(WORKSPACE_SESSION_KEY)).toBeNull();
  Object.assign(globalThis,{sessionStorage:firstTab});expect(getWorkspaceId()).toBe('arrea');
  Object.assign(globalThis,{sessionStorage:receiptTab});await initializeWorkspaces(null);expect(getWorkspaceId()).toBe('decasarre');
 });

 it('admite empresas propias en enlaces y respeta el destino sobre una selección heredada',async()=>{
  const custom=createWorkspace({...DEFAULT_PROFILE,name:'Empresa de mi enlace'});
  await initializeWorkspaces('arrea');await initializeWorkspaces(custom.id);
  expect(getWorkspaceId()).toBe(custom.id);expect(getProfile().name).toBe('Empresa de mi enlace');
  Object.assign(globalThis,{sessionStorage:browserStorage()});await initializeWorkspaces(custom.id);expect(getWorkspaceId()).toBe(custom.id);
 });

 it('rechaza empresas explícitas inexistentes sin elegir otra por defecto',async()=>{
  for(const id of ['', 'legacy', 'custom-no-existe', '../arrea']){
   await expect(initializeWorkspaces(id)).rejects.toThrow('La empresa de este enlace no existe');
   expect(globalThis.sessionStorage.getItem(WORKSPACE_SESSION_KEY)).toBeNull();
  }
  await initializeWorkspaces('decasarre');await expect(initializeWorkspaces('custom-desconocida')).rejects.toThrow('Vuelve al inicio');
  expect(getWorkspaceId()).toBe('decasarre');
 });

 it('valida cada enlace incluso cuando comparte la comprobación inicial en curso',async()=>{
  const results=await Promise.allSettled([initializeWorkspaces('decasarre'),initializeWorkspaces('custom-desconocida')]);
  expect(results[0].status).toBe('fulfilled');expect(results[1].status).toBe('rejected');expect(getWorkspaceId()).toBe('decasarre');
 });

 it('valida la marca y rechaza enlaces ejecutables o logotipos inseguros',()=>{
  expect(validateProfile(BUILTIN_PROFILES.arrea)).toEqual(BUILTIN_PROFILES.arrea);
  expect(validateProfile(BUILTIN_PROFILES.decasarre)).toEqual(BUILTIN_PROFILES.decasarre);
  for(const changes of [{website:'javascript:alert(1)'},{website:'https://user:password@example.test'},{logo:'data:image/svg+xml,bad'},{logo:'../otro.svg'},{accent:'red;bad'},{domain:'empresa.test/<script>'}])expect(()=>createWorkspace({...DEFAULT_PROFILE,...changes})).toThrow();
  expect(listWorkspaces()).toHaveLength(2);
 });

 it('no anuncia un cambio de empresa si no puede conservar la selección para la recarga',async()=>{
  await initializeWorkspaces();
  const original=globalThis.sessionStorage;
  Object.assign(globalThis,{sessionStorage:{getItem:original.getItem,setItem:()=>{throw new DOMException('No disponible','QuotaExceededError');}}});
  try{expect(()=>selectWorkspace('decasarre')).toThrow('almacenamiento de sesión');expect(getWorkspaceId()).toBe('arrea');expect(local.getItem(WORKSPACE_SESSION_KEY)).toBeNull();}
  finally{Object.assign(globalThis,{sessionStorage:original});}
 });
});

describe('Captura y restauración por empresa',()=>{
 it('captura la empresa antes de encolar escrituras y mantiene el bloqueo por base',async()=>{
  await initializeWorkspaces();const requests:string[]=[];
  const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(name:string,task:()=>Promise<unknown>)=>{requests.push(name);return task();}}}});
  let release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{started=resolve;});
  try{
   const first=runLocal(async()=>{started();await gate;expect(getProfile().shortName).toBe('ARREA');await env.BUCKET.put(attachmentKey,new TextEncoder().encode('ARREA'));practiceStorage.setItem('mail-signature-name','ARREA');return Response.json({ok:true});});
   await ready;selectWorkspace('decasarre');
   const second=runLocal(async()=>{expect(getProfile().shortName).toBe('DECASARRE');await env.BUCKET.put(attachmentKey,new TextEncoder().encode('DECASARRE'));practiceStorage.setItem('mail-signature-name','DECASARRE');return Response.json({ok:true});});
   selectWorkspace('arrea');release();await Promise.all([first,second]);
   expect(await fileText('arrea')).toBe('ARREA');expect(await fileText('decasarre')).toBe('DECASARRE');
   expect(workspaceStorage('arrea').getItem('mail-signature-name')).toBe('ARREA');expect(workspaceStorage('decasarre').getItem('mail-signature-name')).toBe('DECASARRE');
   expect(requests).toEqual([workspaceDatabaseName('arrea'),workspaceDatabaseName('decasarre')]);
  }finally{release();if(previous)Object.defineProperty(globalThis,'navigator',previous);else Reflect.deleteProperty(globalThis,'navigator');}
 });

 it('exporta e importa solo la empresa capturada aunque cambie la selección',async()=>{
  await initializeWorkspaces();await seed('ARREA');const exporting=createBackup();selectWorkspace('decasarre');const backup=await exporting;
  expect(backup.company).toBe('ARREA Eventos');expect(backup.files[0].data).toBe(btoa('ARREA'));
  await seed('DECASARRE',20000);const untouched=await createBackup();
  const custom=createWorkspace({...DEFAULT_PROFILE,name:'Destino de la copia'});selectWorkspace(custom.id);
  const importing=restoreBackup(backup);selectWorkspace('decasarre');await importing;
  expect(await accountName(custom.id)).toBe('ARREA');expect(await fileText(custom.id)).toBe('ARREA');expect(getProfile(custom.id)).toEqual(BUILTIN_PROFILES.arrea);
  const after=await createBackup();expect(after.tables).toEqual(untouched.tables);expect(after.files).toEqual(untouched.files);expect(after.storage).toEqual(untouched.storage);
  expect(await accountName('arrea')).toBe('ARREA');expect(getWorkspaceId()).toBe('decasarre');
 });

 it('restaura copias v1 sin la nueva columna y no inventa firmas ni cambia el cuerpo',async()=>{
  await initializeWorkspaces();await seed('ARREA');const backup=await createBackup(),mail=backup.tables.mail_messages,index=mail.columns.indexOf('corporate_signature');
  expect(index).toBeGreaterThan(-1);mail.columns.splice(index,1);mail.rows.forEach(row=>row.splice(index,1));delete backup.storage.profile;
  selectWorkspace('decasarre');await restoreBackup(backup);
  const db=await readDatabase();try{expect(db.exec('SELECT corporate_signature,body FROM mail_messages')[0].values).toEqual([['null','Cuerpo original\n\nSin modificar.']]);}finally{db.close();}
  expect(getProfile()).toEqual(DEFAULT_PROFILE);expect(getProfile('arrea')).toEqual(BUILTIN_PROFILES.arrea);
 });

 it('abre una base antigua con migración aditiva sin modificarla solo por leer',async()=>{
  const db=await freshDatabase();db.run('ALTER TABLE mail_messages DROP COLUMN corporate_signature');const bytes=db.export();db.close();await persistDatabase(bytes,{},'legacy');
  const opened=await readDatabase('legacy');try{expect(opened.exec('PRAGMA table_info(mail_messages)')[0].values.some(row=>row[1]==='corporate_signature')).toBe(true);}finally{opened.close();}
  expect(await readStore('state','database','legacy')).toEqual(bytes);
 });

 it('valida firmas importadas y rechaza ajustes de otra empresa sin alterar datos',async()=>{
  await initializeWorkspaces();await seed('ARREA');const backup=await createBackup();await restoreBackup(backup);
  const roundtrip=await createBackup(),index=roundtrip.tables.mail_messages.columns.indexOf('corporate_signature');expect(JSON.parse(String(roundtrip.tables.mail_messages.rows[0][index]))).toEqual(signature);
  const invalid=structuredClone(backup);invalid.tables.mail_messages.rows[0][index]=JSON.stringify({...signature,website:'javascript:alert(1)'});await expect(restoreBackup(invalid)).rejects.toThrow('web');
  const escape=structuredClone(backup);escape.storage['aula-simulacion:workspace:v1:decasarre:profile']='{}';await expect(restoreBackup(escape)).rejects.toThrow('ajustes');
  expect(await accountName()).toBe('ARREA');expect(await fileText()).toBe('ARREA');expect(await accountName('decasarre')).toBeNull();
 });

 it('revierte preferencias si no se puede confirmar la base y los adjuntos',async()=>{
  await initializeWorkspaces();await seed('ARREA');const source=await createBackup();
  selectWorkspace('decasarre');await seed('DECASARRE');const original=await createBackup(),transaction=IDBDatabase.prototype.transaction;
  const spy=vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase['transaction']>){if(this.name===workspaceDatabaseName('decasarre')&&args[1]==='readwrite')throw Error('Fallo de persistencia simulado');return transaction.apply(this,args);});
  await expect(restoreBackup(source)).rejects.toThrow('persistencia');spy.mockRestore();
  const after=await createBackup();expect(after.tables).toEqual(original.tables);expect(after.files).toEqual(original.files);expect(after.storage).toEqual(original.storage);
 });
});
