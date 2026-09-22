import type {Database,SqlValue} from 'sql.js';
import {allFiles,exclusive,freshDatabase,persistDatabase,readDatabase,type StoredFile} from './runtime';
import {selectedWorkspaceId,storageSnapshot,workspaceStorage} from './storage';
import {DEFAULT_PROFILE,getProfile,validateProfile} from './profile';
import {normalizeSignature} from '../mail-signature';
const MAX_BYTES=80*1024*1024;
const tables=['mail_messages','mail_rate_limits','bank_accounts','bank_batches','bank_movements','sepe_batches','sepe_contracts','social_batches','social_documents','social_registry','bank_mandates','bank_products','bank_product_payments','practice_files','practice_guards','bank_preferences','documentation_assignments','documentation_files'] as const;
type TableBackup={columns:string[];rows:SqlValue[][]};
export type Backup={format:'aula-simulacion';version:1;createdAt:string;company:string;tables:Record<string,TableBackup>;storage:Record<string,string>;files:{key:string;type:string;data:string}[]};
const toBase64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function tableData(db:Database,name:string){const result=db.exec(`SELECT * FROM "${name}"`)[0];if(result)return {columns:result.columns,rows:result.values};const columns=db.exec(`PRAGMA table_info("${name}")`)[0].values.map(r=>String(r[1]));return {columns,rows:[]};}
export async function createBackup(){const id=selectedWorkspaceId();return exclusive(async()=>{const db=await readDatabase(id);try{const profile=getProfile(id),data:Backup={format:'aula-simulacion',version:1,createdAt:new Date().toISOString(),company:profile.name,tables:Object.fromEntries(tables.map(t=>[t,tableData(db,t)])),storage:{...storageSnapshot(id),profile:JSON.stringify(profile)},files:[...await allFiles(id)].map(([key,f])=>({key,type:f.type,data:toBase64(f.bytes)}))};return data;}finally{db.close();}},id);}
const allowedStorage=(key:string)=>key==='profile'||key==='mail-signature-name'||/^aula-(presentaciones-v1|informativas-v1|borrador-(303|111|115)|informativa-borrador-(190|347|349))$/.test(key);
export async function readBackupFile(file:File){if(file.size>MAX_BYTES)throw Error('La copia supera el límite de 80 MB.');let data:unknown;try{data=JSON.parse(await file.text());}catch{throw Error('No se puede leer la copia. Selecciona un archivo exportado desde esta aula.');}const prepared=await prepareBackup(data);prepared.db.close();return data as Backup;}
async function prepareBackup(value:unknown){
 const b=value as Backup;if(!b||b.format!=='aula-simulacion'||b.version!==1||!b.tables||typeof b.tables!=='object'||Array.isArray(b.tables)||!b.storage||typeof b.storage!=='object'||Array.isArray(b.storage)||!Array.isArray(b.files)||Object.keys(b.tables).some(name=>!tables.includes(name as typeof tables[number]))||(Object.keys(b.tables).length!==tables.length&&!(Object.keys(b.tables).length===tables.length-2&&!b.tables.documentation_assignments&&!b.tables.documentation_files)))throw Error('Esta copia no es compatible con el aula.');
 const db=await freshDatabase(),files=new Map<string,StoredFile>();
 try{
  db.run('PRAGMA foreign_keys=OFF');db.run('BEGIN');let count=0;
  for(const name of tables){if(name.startsWith('documentation_')&&!b.tables[name])continue;const t=b.tables[name],schema=db.exec(`PRAGMA table_info("${name}")`)[0].values,expected=schema.map(r=>String(r[1]));
   const oldMail=name==='mail_messages'&&JSON.stringify(t?.columns)===JSON.stringify(expected.filter(column=>column!=='corporate_signature'));
   const oldBank=name==='bank_batches'&&JSON.stringify(t?.columns)===JSON.stringify(expected.filter(column=>column!=='receipt_details'));
   if(!t||(!oldMail&&!oldBank&&JSON.stringify(t.columns)!==JSON.stringify(expected))||!Array.isArray(t.rows)||t.rows.length>50000||(count+=t.rows.length)>80000)throw Error('La estructura de la copia no es válida.');
   const s=db.prepare(`INSERT INTO "${name}" (${expected.map(k=>'"'+k+'"').join(',')}) VALUES (${expected.map(()=>'?').join(',')})`);
   try{for(const source of t.rows){if(!Array.isArray(source)||source.length!==t.columns.length)throw Error('La copia contiene datos no válidos.');
     const row=oldMail||oldBank?expected.map(column=>t.columns.includes(column)?source[t.columns.indexOf(column)]:'null'):[...source];
     if(row.length!==expected.length||row.some((v,i)=>v!==null&&(typeof v!=='string'&&typeof v!=='number'||typeof v==='number'&&!Number.isFinite(v)||String(schema[i][2]).toUpperCase()==='INTEGER'&&!Number.isSafeInteger(v)||typeof v==='string'&&v.length>5000000)))throw Error('La copia contiene datos no válidos.');
     const companyIndex=expected.indexOf('company_id');if(companyIndex>=0&&row[companyIndex]!=='demo')throw Error('Esta copia corresponde a otra plataforma.');
     for(const key of ['data','warnings','attachments','receipt','receipt_details']){const i=expected.indexOf(key);if(i>=0&&row[i]!==null)JSON.parse(String(row[i]));}
     const signatureIndex=expected.indexOf('corporate_signature');if(signatureIndex>=0){if(row[signatureIndex]===null)row[signatureIndex]='null';if(typeof row[signatureIndex]!=='string')throw Error('La firma corporativa de la copia no es válida.');row[signatureIndex]=JSON.stringify(normalizeSignature(JSON.parse(String(row[signatureIndex]))));}
     s.run(row);
   }}finally{s.free();}
  }
  if(db.exec('PRAGMA foreign_key_check').length)throw Error('Faltan registros relacionados en esta copia.');db.run('COMMIT');db.run('PRAGMA foreign_keys=ON');
  let fileBytes=0;for(const f of b.files){if(!f||typeof f.key!=='string'||!/^((mail|social|documentation)\/demo\/)[a-zA-Z0-9/_.-]+$/.test(f.key)||files.has(f.key)||typeof f.data!=='string'||f.data.length>14000000||typeof f.type!=='string'||f.type.length>100)throw Error('Un adjunto de la copia no es válido.');const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));if((fileBytes+=bytes.length)>60*1024*1024)throw Error('Los adjuntos de la copia superan 60 MB.');files.set(f.key,{bytes,type:f.type});}
  if(Object.keys(b.storage).some(k=>!allowedStorage(k)))throw Error('La copia contiene ajustes no compatibles.');let storageBytes=0;
  const restoredStorage:Record<string,string>={};
  for(const [k,v] of Object.entries(b.storage)){if(typeof v!=='string'||(storageBytes+=v.length)>2500000)throw Error('Los borradores de la copia superan el tamaño permitido.');if(k==='profile')restoredStorage[k]=JSON.stringify(validateProfile(JSON.parse(v)));else{if(k!=='mail-signature-name')JSON.parse(v);else if(v.length>120)throw Error('La firma no es válida.');restoredStorage[k]=v;}}
  // Original v1 exports omitted an untouched generic profile. Restore that
  // identity explicitly instead of inheriting the target company's branding.
  restoredStorage.profile??=JSON.stringify(DEFAULT_PROFILE);
  // A backup cannot refer to missing files and still be reported as complete.
  for(const row of db.exec('SELECT attachments FROM mail_messages')[0]?.values||[])for(const f of JSON.parse(String(row[0])))if(!files.has(f.key))throw Error('Falta un adjunto del correo en esta copia.');
  for(const row of db.exec("SELECT pdf_key FROM social_documents WHERE pdf_key<>''")[0]?.values||[])if(!files.has(String(row[0])))throw Error('Falta un documento de cotización en esta copia.');
  for(const row of db.exec('SELECT id,assignment_id,file_key,size FROM documentation_files')[0]?.values||[]){
   const [id,assignmentId,key,size]=row,file=files.get(String(key));
   if(key!==`documentation/demo/${assignmentId}/${id}`||!file||file.bytes.length!==size)throw Error('Falta un documento del encargo o su tamaño no coincide.');
  }
  return {db,files,storage:restoredStorage};
 }catch(e){db.close();throw e instanceof Error?e:Error('La copia no se ha podido comprobar.');}
}
export async function restoreBackup(value:Backup,id=selectedWorkspaceId()){return exclusive(async()=>{
 const prepared=await prepareBackup(value),storage=workspaceStorage(id),old=storageSnapshot(id);
 try{
  // Probe storage quota and roll back the preferences if IndexedDB cannot commit.
  for(const key of storage.keys())storage.removeItem(key);
  for(const [key,v] of Object.entries(prepared.storage))storage.setItem(key,v);
  await persistDatabase(prepared.db.export(),{replaceFiles:true,files:prepared.files},id);
 }catch(e){for(const key of storage.keys())storage.removeItem(key);for(const [key,v] of Object.entries(old))storage.setItem(key,v);throw e;}
 finally{prepared.db.close();}
 },id);}
