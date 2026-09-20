import {companyId,companyProfile} from './company-server';
import {env} from '@/lib/local/runtime';
import {SocialError} from './social-types';
import {registrySummary} from './social-receipt-data';
import {socialPdfResponse} from './social-receipt-pdf';
import {socialValidDate} from './social-pdf';
import type {RegistryData,RegistryKind,RegistryRecord} from './social-registry-types';
const cols='id,kind,reference,title,number,effective_date AS effectiveDate,created_at AS createdAt,data,fingerprint';
type Row=Omit<RegistryRecord,'data'>&{data:string;fingerprint:string};
const clean=({fingerprint,data,...r}:Row):RegistryRecord=>({...r,data:JSON.parse(data)});
const json=(d:unknown,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function db(){if(!env.DB)throw new SocialError('El servicio no está disponible temporalmente.',503);return env.DB;}
function uuid(v:unknown){if(typeof v!=='string'||! /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v))throw new SocialError('La referencia de solicitud no es válida.');return v.toLowerCase();}
function kind(v:unknown):RegistryKind{if(v!=='company'&&v!=='person'&&v!=='employment')throw new SocialError('Seleccione un trámite válido.');return v;}
function field(p:RegistryData,key:string,label:string,max=100,optional=false){const value=p[key];if(value!==undefined&&typeof value!=='string')throw new SocialError('Revise '+label+'.');const s=(value||'').trim().replace(/\s+/g,' ');if((!s&&!optional)||s.length>max||/[\u0000-\u001f\u007f]/.test(s))throw new SocialError('Revise '+label+(s.length>max?': máximo '+max+' caracteres.':'.'));return s;}
function pattern(s:string,re:RegExp,label:string){if(!re.test(s))throw new SocialError('Revise '+label+'.');return s;}
const digits=(s:string)=>s.replace(/[\s/-]/g,'');
const ident=(s:string)=>s.replace(/[\s-]/g,'').toUpperCase();
function numberFor(id:string,length:number){const base='00'+String(parseInt(id.replaceAll('-','').slice(0,12),16)%(10**(length-4))).padStart(length-4,'0');return base+String(Number(base)%97).padStart(2,'0');}
const stored=(id:string)=>db().prepare(`SELECT ${cols} FROM social_registry WHERE company_id=? AND id=?`).bind(companyId(),id).first<Row>();
async function sha(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');}
async function boundary(run:()=>Promise<Response>){try{return await run();}catch(e){if(e instanceof SocialError)return json({error:e.message,...(e.batchId?{recordId:e.batchId}:{})},e.status);console.error('Social registry failed',e instanceof Error?e.message:'Unknown');return json({error:'No se ha podido registrar la solicitud. Sus datos siguen en el formulario; vuelva a intentarlo.'},503);}}
async function payload(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new SocialError('Abra el trámite desde la sede.',403);if(!req.headers.get('content-type')?.includes('application/json'))throw new SocialError('Formato no admitido.',415);const reader=req.body?.getReader();if(!reader)throw new SocialError('Faltan los datos.');let length=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>24000){await reader.cancel();throw new SocialError('El formulario supera el tamaño permitido.',413);}chunks.push(value);}const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}try{const p=JSON.parse(new TextDecoder().decode(bytes));if(!p||typeof p!=='object'||Array.isArray(p))throw 0;return p;}catch{throw new SocialError('No se han podido leer los datos.');}}
async function normalize(k:RegistryKind,id:string,p:RegistryData){
 const effectiveDate=socialValidDate(p.effectiveDate);let data:RegistryData={effectiveDate},title='',number='',identityKey='';
 if(k==='company'){
  const nif=pattern(ident(field(p,'nif','el NIF',20)),/^[A-Z0-9]{9}$/,'el NIF (9 caracteres)');
  const ccc=field(p,'ccc','el CCC',20,true);number=ccc?pattern(digits(ccc),/^\d{11}$/,'el CCC (11 dígitos)'):numberFor(id,11);
  title=field(p,'name','la razón social',100);identityKey=nif;
  data={...data,name:title,nif,ccc:number,numberAssigned:ccc?'no':'yes',address:field(p,'address','el domicilio',120),postcode:pattern(field(p,'postcode','el código postal',5),/^\d{5}$/,'el código postal'),city:field(p,'city','el municipio',60),province:field(p,'province','la provincia',40),activity:field(p,'activity','la actividad económica',100),cnae:pattern(field(p,'cnae','el CNAE',4),/^\d{4}$/,'el CNAE (4 dígitos)'),regime:'0111 · Régimen General',entity:field(p,'entity','la entidad de cobertura',80),representative:field(p,'representative','el representante',100,true)};
 }else if(k==='person'){
  const documentType=pattern(field(p,'documentType','el tipo de documento',10),/^(DNI|NIE|Pasaporte)$/,'el tipo de documento');
  const personId=ident(field(p,'personId','el documento de identidad',20));pattern(personId,documentType==='DNI'?/^\d{8}[A-Z]$/:documentType==='NIE'?/^[XYZ]\d{7}[A-Z]$/:/^[A-Z0-9]{5,20}$/,'el documento de identidad');
  const nss=field(p,'nss','el número de Seguridad Social',20,true);number=nss?pattern(digits(nss),/^\d{12}$/,'el número de Seguridad Social (12 dígitos)'):numberFor(id,12);
  const firstName=field(p,'firstName','el nombre',50),lastName=field(p,'lastName','el primer apellido',50),secondName=field(p,'secondName','el segundo apellido',50,true),birthDate=socialValidDate(p.birthDate);
  if(birthDate>=effectiveDate)throw new SocialError('La fecha de nacimiento debe ser anterior a la fecha de solicitud.');
  title=[firstName,lastName,secondName].filter(Boolean).join(' ');identityKey=personId;
  data={...data,firstName,lastName,secondName,documentType,personId,birthDate,nationality:field(p,'nationality','la nacionalidad',40),address:field(p,'address','el domicilio',120),postcode:pattern(field(p,'postcode','el código postal',5),/^\d{5}$/,'el código postal'),city:field(p,'city','el municipio',60),province:field(p,'province','la provincia',40),nss:number,numberAssigned:nss?'no':'yes'};
 }else{
  const companyId=uuid(p.companyId),personId=uuid(p.personId),company=await stored(companyId),person=await stored(personId);
  if(!company||company.kind!=='company')throw new SocialError('Seleccione una empresa inscrita en esta sede.');if(!person||person.kind!=='person')throw new SocialError('Seleccione una persona afiliada en esta sede.');
  const c=clean(company),w=clean(person);
  if(effectiveDate<c.effectiveDate||effectiveDate<w.effectiveDate)throw new SocialError('El alta debe ser igual o posterior a la inscripción de la empresa y a la afiliación de la persona.');
  const birthday=w.data.birthDate;const sixteenth=String(Number(birthday.slice(0,4))+16)+birthday.slice(4);if(effectiveDate<sixteenth)throw new SocialError('Revise la fecha de alta: la persona no ha cumplido 16 años.');
  const contract=pattern(field(p,'contract','el código de contrato',3),/^\d{3}$/,'el código de contrato (3 dígitos)'),group=pattern(field(p,'group','el grupo de cotización',2),/^(0?[1-9]|1[01])$/,'el grupo de cotización (1 a 11)'),percent=field(p,'percent','la jornada',6);
  if(!/^\d{1,3}(\.\d{1,2})?$/.test(percent)||Number(percent)<=0||Number(percent)>100)throw new SocialError('La jornada debe ser mayor que 0 y como máximo 100 %.');
  title=w.title+' · '+c.title;number=w.number;identityKey=companyId+':'+personId;
  data={...data,companyId,personId,company:c.title,nif:c.data.nif,ccc:c.number,worker:w.title,documentType:w.data.documentType,workerId:w.data.personId,nss:w.number,regime:c.data.regime,contract,group:String(Number(group)),percent:String(Number(percent)),occupation:field(p,'occupation','el puesto de trabajo',80)};
 }
 return {data,title,number,identityKey,numberKey:k==='employment'?identityKey:number,effectiveDate};
}
export function readRegistry(req:Request){return boundary(async()=>{
 const u=new URL(req.url),id=u.searchParams.get('id');if(id){const r=await stored(uuid(id));if(!r)throw new SocialError('No se encuentra el registro.',404);if(u.searchParams.get('pdf')==='1')return socialPdfResponse(registrySummary(clean(r)));return json({record:clean(r)});}
 if(u.searchParams.get('options')==='1'){const r=await db().prepare('SELECT id,kind,title,number FROM social_registry WHERE company_id=? AND kind IN (?,?) ORDER BY title LIMIT 2000').bind(companyId(),'company','person').all();return json({options:r.results});}
 const page=Number(u.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>500)throw new SocialError('Página no válida.');let where='company_id=?';const args:(string|number)[]=[companyId()];if(u.searchParams.get('kind')){where+=' AND kind=?';args.push(kind(u.searchParams.get('kind')));}const q=(u.searchParams.get('q')||'').trim().slice(0,100).replace(/[\\%_]/g,'\\$&');if(q){where+=" AND (title LIKE ? ESCAPE '\\' OR number LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\' OR identity_key LIKE ? ESCAPE '\\')";args.push(...Array(4).fill('%'+q+'%'));}
 const rows=await db().batch([db().prepare(`SELECT ${cols} FROM social_registry WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).bind(...args,page*20),db().prepare(`SELECT COUNT(*) AS total FROM social_registry WHERE ${where}`).bind(...args)]);return json({records:(rows[0].results as Row[]).map(clean),total:(rows[1].results[0] as {total:number}).total,page,pageSize:20});
});}
export function writeRegistry(req:Request){return boundary(async()=>{
 const p=await payload(req);if(p.action!=='preview'&&p.action!=='register')throw new SocialError('Operación no válida.');const id=uuid(p.id),k=kind(p.kind);if(!p.data||typeof p.data!=='object'||Array.isArray(p.data))throw new SocialError('Faltan los datos del formulario.');
 const n=await normalize(k,id,p.data),fingerprint=await sha(JSON.stringify({kind:k,data:n.data})),now=new Date().toISOString();
 const record:RegistryRecord={id,kind:k,reference:'SIM-TGSS-'+n.effectiveDate.slice(0,4)+'-'+id.replaceAll('-','').slice(0,12).toUpperCase(),title:n.title,number:n.number,effectiveDate:n.effectiveDate,createdAt:now,data:n.data};
 const existing=await stored(id);if(existing&&existing.fingerprint!==fingerprint)throw new SocialError('La referencia pertenece a otro trámite.',409,id);
 const conflict=async()=>db().prepare('SELECT id FROM social_registry WHERE company_id=? AND kind=? AND (identity_key=? OR number_key=?) AND id<>?').bind(companyId(),k,n.identityKey,n.numberKey,id).first<{id:string}>();
 const duplicated=await conflict();if(duplicated)throw new SocialError(k==='company'?'Ya existe una empresa con este NIF o CCC.':k==='person'?'Ya existe una afiliación con este documento o número de Seguridad Social.':'La persona ya tiene un alta en esta empresa.',409,duplicated.id);
 if(p.action==='preview')return json({record:existing?clean(existing):record,fingerprint});
 if(p.consent!==true)throw new SocialError('Confirme que los datos son correctos.');if(p.fingerprint!==fingerprint)throw new SocialError('Los datos han cambiado. Revise la solicitud de nuevo.',409);
 if(existing)return json({record:clean(existing)});
 try{const r=await db().prepare(`INSERT INTO social_registry(id,company_id,kind,identity_key,number_key,reference,title,number,effective_date,created_at,data,fingerprint) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM social_registry WHERE company_id=?)<2000 AND (?<>'employment' OR (EXISTS(SELECT 1 FROM social_registry WHERE company_id=? AND id=? AND kind='company') AND EXISTS(SELECT 1 FROM social_registry WHERE company_id=? AND id=? AND kind='person')))`).bind(id,companyId(),k,n.identityKey,n.numberKey,record.reference,n.title,n.number,n.effectiveDate,now,JSON.stringify(n.data),fingerprint,companyId(),k,companyId(),n.data.companyId||'',companyId(),n.data.personId||'').run();if(!r.meta.changes)throw new SocialError('No se ha registrado: se ha alcanzado el límite de 2.000 registros o la empresa o persona ya no existe. Actualice la consulta.',409);
 }catch(e){const raced=await stored(id);if(raced){if(raced.fingerprint===fingerprint)return json({record:clean(raced)});throw new SocialError('La referencia pertenece a otro trámite.',409,id);}const c=await conflict();if(c)throw new SocialError('Otro equipo ya ha registrado estos datos. Consulte el justificante existente.',409,c.id);throw e;}
 return json({record},201);
});}
