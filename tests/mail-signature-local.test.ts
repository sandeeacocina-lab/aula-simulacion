import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {normalizeSignature,type MailSignature} from '../lib/mail-signature';

function memoryStorage(){
 const storage:Record<string,string>&{getItem:any;setItem:any;removeItem:any}={} as any;
 Object.defineProperties(storage,{
  getItem:{value:(key:string)=>storage[key]??null},
  setItem:{value:(key:string,value:string)=>{storage[key]=String(value);}},
  removeItem:{value:(key:string)=>{delete storage[key];}},
 });
 return storage;
}
const localStorage=memoryStorage(),sessionStorage=memoryStorage();
Object.assign(globalThis,{indexedDB,localStorage,sessionStorage});
const {setEngineForTests,freshDatabase,persistDatabase,allFiles}=await import('../lib/local/runtime');
const {localRequest}=await import('../lib/local/dispatch');
const {getProfile,saveProfile}=await import('../lib/local/profile');
const {setSelectedWorkspaceId}=await import('../lib/local/storage');
const {createBackup,restoreBackup}=await import('../lib/local/backup');

const signature:MailSignature={name:'Élodie Muñoz',role:'Coordinación Ω',organization:'Viñedos Genéricos, S.L.',email:'elodie@example.test',phone:'+34 600 123 456',website:'https://example.test/catalogo',location:'Peñafiel · Valladolid',color:'#187078'};
const incoming=(extra:Record<string,unknown>={})=>({id:crypto.randomUUID(),action:'receive',senderName:'Proveedor de prácticas',senderAddress:'proveedor@example.test',subject:'Oferta de prácticas',body:'Buenos días:\n\nAdjuntamos nuestra propuesta.',consent:true,attachmentIds:[],...extra});
async function post(data:unknown,status=200){
 const response=await localRequest('/api/correo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();
 expect(response.status,JSON.stringify(result)).toBe(status);return result;
}
async function get(id?:string){
 const response=await localRequest('/api/correo'+(id?'?id='+id:'')),result=await response.json();
 expect(response.status,JSON.stringify(result)).toBe(200);return result;
}
async function exported(id:string,format:'eml'|'pdf'){
 const response=await localRequest('/api/correo/exportar?id='+id+'&format='+format);
 expect(response.status).toBe(200);
 expect(response.headers.get('content-type')).toBe(format==='eml'?'message/rfc822':'application/pdf');
 return response;
}
function emlPart(eml:string,type:'plain'|'html'){
 const encoded=eml.match(new RegExp('Content-Type: text/'+type+'; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n--'))?.[1];
 expect(encoded,'The EML has a base64 '+type+' part').toBeTruthy();
 return Buffer.from(encoded!.replace(/\s/g,''),'base64').toString('utf8');
}
const escaped=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

// The local writer embeds an uncompressed ToUnicode map and page text streams.
// Decode those public PDF structures without adding a PDF parser dependency.
function pdfPages(bytes:ArrayBuffer){
 const raw=Buffer.from(bytes).toString('latin1'),unicode=new Map<string,string>();
 expect(raw.startsWith('%PDF-')).toBe(true);
 for(const block of raw.matchAll(/beginbfchar\s+([\s\S]*?)\s+endbfchar/g))for(const pair of block[1].matchAll(/<([0-9a-f]+)>\s+<([0-9a-f]+)>/g)){
  unicode.set(pair[1],String.fromCharCode(...pair[2].match(/.{4}/g)!.map(code=>parseInt(code,16))));
 }
 expect(unicode.size).toBeGreaterThan(0);
 const objects=new Map([...raw.matchAll(/^(\d+) 0 obj\n([\s\S]*?)\nendobj/gm)].map(match=>[match[1],match[2]]));
 const pages=[...objects.values()].filter(object=>/\/Type \/Page\b/.test(object)).map(page=>{
  const reference=page.match(/\/Contents (\d+) 0 R/)![1],content=objects.get(reference)!;
  const runs=[...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm <([0-9a-f]*)> Tj/g)].map(run=>({
   x:Number(run[1]),y:Number(run[2]),text:(run[3].match(/.{4}/g)||[]).map(code=>{expect(unicode.has(code)).toBe(true);return unicode.get(code)!;}).join(''),
  }));
  return {runs,text:runs.map(run=>run.text).join('\n')};
 });
 expect(pages).not.toHaveLength(0);return pages;
}

beforeAll(async()=>{setEngineForTests(await initSqlJs());});
beforeEach(async()=>{
 for(const store of [localStorage,sessionStorage])for(const key of Object.keys(store))delete store[key];
 setSelectedWorkspaceId('legacy');
 const db=await freshDatabase();
 try{for(const id of ['legacy','arrea','decasarre'])await persistDatabase(db.export(),{replaceFiles:true},id);}finally{db.close();}
});

describe('Firmas corporativas y exportaciones locales',()=>{
 it('normaliza los datos válidos y rechaza firmas, campos, enlaces y colores inválidos',()=>{
  expect(normalizeSignature(undefined)).toBeNull();expect(normalizeSignature(null)).toBeNull();
  expect(normalizeSignature({name:'  Ana  ',website:'https://example.test'})).toEqual({name:'Ana',role:'',organization:'',email:'',phone:'',website:'https://example.test/',location:'',color:'#187078'});
  expect(normalizeSignature({organization:'Empresa sin persona'})).toMatchObject({name:'',organization:'Empresa sin persona'});
  const invalid:unknown[]=[false,1,'firma',[],{}, {name:'   '},
   ...(['name','role','organization','email','phone','website','location','color'] as const).flatMap(field=>[
    {...signature,[field]:123},{...signature,[field]:{}},{...signature,[field]:'valor\ninyectado'},
    {...signature,[field]:'valor\tcontrol'},{...signature,[field]:'valor\u0000control'},{...signature,[field]:'valor\u007fcontrol'},
   ]),
   ...Object.entries({name:100,role:120,organization:120,email:120,phone:50,website:240,location:120,color:7}).map(([field,max])=>({...signature,[field]:'a'.repeat(max+1)})),
   ...['sin-arroba','persona@sin-punto','persona @example.test','<persona>@example.test'].map(email=>({...signature,email})),
   ...['javascript:alert(1)','data:text/html,prueba','ftp://example.test','//example.test','example.test','https://user:secret@example.test'].map(website=>({...signature,website})),
   ...['red','#ffffff','#187078;','#18707g'].map(color=>({...signature,color})),
  ];
  for(const value of invalid)expect(()=>normalizeSignature(value),JSON.stringify(value)).toThrow();
 });

 it('conserva la firma recibida, acepta reintentos idénticos y rechaza cambios con el mismo id',async()=>{
  const request=incoming({signature:{...signature,name:'  '+signature.name+'  '}}),created=(await post(request,201)).message;
  expect(created.signature).toEqual(signature);expect(created.companyId).toBe('demo');
  expect((await get(request.id)).message).toEqual(created);
  expect((await get()).messages[0].signature).toEqual(signature);
  expect((await post({...request,signature})).message).toEqual(created);
  await post({...request,signature:{...signature,role:'Otro cargo'}},409);
  await post({...request,signature:null},409);
  expect((await get(request.id)).message).toEqual(created);expect((await get()).total).toBe(1);
  expect((await allFiles()).size).toBe(0);
 });

 it('admite firmas nulas y ausentes sin inventar una, y no guarda entradas inválidas',async()=>{
  for(const extra of [{signature:null},{}]){
   const request=incoming(extra),created=(await post(request,201)).message;
   expect(created.signature).toBeNull();expect((await get(request.id)).message.signature).toBeNull();
   expect((await post({...request,signature:null})).message).toEqual(created);
  }
  await post(incoming({signature:{...signature,website:'javascript:alert(1)'}}),400);
  expect((await get()).total).toBe(2);
 });

 it('no atribuye logos del aula a una organización externa genérica ni a mensajes sin firma',async()=>{
  setSelectedWorkspaceId('arrea');
  for(const incomingSignature of [signature,null]){
   const request=incoming({signature:incomingSignature});await post(request,201);
   const eml=await (await exported(request.id,'eml')).text(),html=emlPart(eml,'html');
   expect(eml).not.toContain('Content-ID:');expect(eml).not.toContain('Content-Type: image/');
   expect(html).not.toContain('<img');expect(html).not.toContain('cid:');
   if(incomingSignature)expect(html).toContain(signature.organization);
   expect(html).not.toContain('ARREA');expect(html).not.toContain('DECASARRE');
  }
 });

 it.each([['ARREA Eventos','arrea'],['DECASARRE, S.A.S.','decasarre']])('incluye el CID de %s y solo su imagen incorporada',async(organization,brand)=>{
  setSelectedWorkspaceId(brand==='arrea'?'decasarre':'arrea');
  const request=incoming({signature:{...signature,organization}});await post(request,201);
  const eml=await (await exported(request.id,'eml')).text(),html=emlPart(eml,'html');
  expect(eml).toContain('Content-ID: <'+brand+'-logo@aula.test>');
  expect(eml.match(/Content-ID:/g)).toHaveLength(1);
  expect(eml).toContain('Content-Disposition: inline; filename="'+brand+'-logo.jpg"');
  expect(html).toContain('src="cid:'+brand+'-logo@aula.test"');
  const base64=eml.match(/Content-Disposition: inline; filename="[^"]+"\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/)![1];
  expect([...Buffer.from(base64.replace(/\s/g,''),'base64').subarray(0,3)]).toEqual([255,216,255]);
  expect(html).not.toMatch(/<img[^>]+src="https?:/);
 });

 it('escapa cuerpo y todos los campos de firma en el HTML sin perder el texto original',async()=>{
  const dangerous={...signature,name:'Ana <script> & "\' Apellido',role:'Cargo <img> & "\'',organization:'Empresa <svg> & "\'',email:"a&'@example.test",phone:'+34 <b> & "\'',location:'Peñafiel <iframe> & "\'',website:"https://example.test/?uno=1&dos='dos'"};
  const body='Texto <script>alert("prueba")</script> & \'contenido\'',request=incoming({body,signature:dangerous});
  await post(request,201);const eml=await (await exported(request.id,'eml')).text(),html=emlPart(eml,'html'),plain=emlPart(eml,'plain');
  expect(html).toContain(escaped(body));expect(plain).toContain(body);
  const normalized=normalizeSignature(dangerous)!;
  for(const field of ['name','role','organization','email','phone','location','website'] as const){expect(html).toContain(escaped(normalized[field]));expect(plain).toContain(normalized[field]);}
  expect(html).toContain('href="'+escaped(normalized.website)+'"');
  expect(html).not.toMatch(/<(script|img|svg|iframe|b)(?:\s|>)/);
 });

 it('usa la identidad dinámica de cada espacio aunque las dos empresas tengan id demo',async()=>{
  for(const brand of ['arrea','decasarre']){
   setSelectedWorkspaceId(brand);const profile=getProfile();expect(profile.id).toBe('demo');
   const request={id:crypto.randomUUID(),action:'send',senderName:'Ana de Administración',recipient:'cliente@example.test',subject:'Respuesta de '+brand,body:'Envío de prácticas.',consent:true};
   const sent=(await post(request,201)).message;expect(sent.companyId).toBe('demo');expect(sent.senderAddress).toBe(profile.mailbox);expect(sent.signature).toBeNull();
   const eml=await (await exported(request.id,'eml')).text(),html=emlPart(eml,'html');
   expect(eml).toContain('Content-ID: <'+brand+'-logo@aula.test>');
   for(const value of [profile.name,profile.activity,profile.mailbox,profile.website])expect(html).toContain(escaped(value));
   const pages=pdfPages(await (await exported(request.id,'pdf')).arrayBuffer());
   expect(pages.map(page=>page.text).join('\n')).toContain(profile.name);
   saveProfile({...profile,name:profile.name+' Personalizada',activity:'Actividad actualizada'});
   const changed=emlPart(await (await exported(request.id,'eml')).text(),'html');
   expect(changed).toContain(profile.name+' Personalizada');expect(changed).toContain('Actividad actualizada');
  }
 });

 it('exporta firma Unicode y cuerpo largo paginados sin modificar texto, lectura ni revisión',async()=>{
  const lines=Array.from({length:100},(_,i)=>'Línea '+String(i+1).padStart(3,'0')+' — envío, piñón y 123,45 €.'),request=incoming({body:lines.join('\n'),signature});
  await post(request,201);
  await post({action:'read',id:request.id,isRead:true});await post({action:'read',id:request.id,isRead:false});
  const before=(await get(request.id)).message;
  expect(before.isRead).toBe(0);
  const eml=await (await exported(request.id,'eml')).text(),plain=emlPart(eml,'plain');
  expect(plain.replace(/\r\n/g,'\n')).toContain(request.body);
  const pages=pdfPages(await (await exported(request.id,'pdf')).arrayBuffer()),text=pages.map(page=>page.text).join('\n');
  expect(pages.length).toBeGreaterThan(2);
  for(const line of lines)expect(text.split(line)).toHaveLength(2);
  for(const value of Object.entries(signature).filter(([key])=>key!=='color').map(([,value])=>value)){
   expect(text.split(value),value).toHaveLength(2);expect(pages.at(-1)!.text).toContain(value);
  }
  pages.forEach((page,index)=>{
   expect(page.text).toContain('Página '+(index+1));
   for(const run of page.runs){expect(run.x).toBeGreaterThanOrEqual(44);expect(run.y).toBeGreaterThanOrEqual(34);expect(run.y).toBeLessThanOrEqual(803);}
  });
  expect((await get(request.id)).message).toEqual(before);
  expect((await get()).unread).toBe(1);expect((await allFiles()).size).toBe(0);
 });

 it('conserva firmas en copias, acepta copias antiguas sin firma y rechaza firmas corruptas sin mutar datos',async()=>{
  const request=incoming({signature});await post(request,201);const before=(await get(request.id)).message,backup=await createBackup();
  const db=await freshDatabase();try{await persistDatabase(db.export(),{replaceFiles:true});}finally{db.close();}
  await restoreBackup(backup);expect((await get(request.id)).message).toEqual(before);
  const malformed=structuredClone(backup),column=malformed.tables.mail_messages.columns.indexOf('corporate_signature');
  expect(column).toBeGreaterThanOrEqual(0);
  malformed.tables.mail_messages.rows[0][column]=JSON.stringify({...signature,website:'javascript:alert(1)'});
  await expect(restoreBackup(malformed)).rejects.toThrow();expect((await get(request.id)).message).toEqual(before);
  const old=structuredClone(backup);old.tables.mail_messages.columns.splice(column,1);for(const row of old.tables.mail_messages.rows)row.splice(column,1);
  await restoreBackup(old);expect((await get(request.id)).message).toEqual({...before,signature:null});
 });
});
