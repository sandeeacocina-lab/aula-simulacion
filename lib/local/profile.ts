import {storageWorkspaceId,workspaceStorage} from './storage';
export const DEFAULT_PROFILE={id:'demo',name:'Empresa de prácticas, S.L.',legalName:'Empresa de prácticas, S.L.',shortName:'Empresa de prácticas',nif:'B12345674',ccc:'28123456740',iban:'ES9121000418450200051332',mailbox:'administracion@empresa.test',website:'',domain:'empresa.test',activity:'Servicios y comercialización',logo:'./empresa.svg',accent:'#087f8c'};
export type Profile=typeof DEFAULT_PROFILE;
// Profiles only: no records or browser state are copied from the live central.
export const BUILTIN_PROFILES:Record<'arrea'|'decasarre',Profile>={
 arrea:{id:'demo',name:'ARREA Eventos',legalName:'ARREA Eventos',shortName:'ARREA',nif:'B47425400',ccc:'47801073570',iban:'ES4631806012310417965868',mailbox:'info@arrea.test',website:'https://sandeeacocina-lab.github.io/Arrea/',domain:'arreaeventos.es',activity:'Organización de eventos empresariales',logo:'./arrea-logo.png',accent:'#a90045'},
 decasarre:{id:'demo',name:'DECASARRE',legalName:'DECASARRE, S.A.S.',shortName:'DECASARRE',nif:'A47135363',ccc:'47162967053',iban:'ES4631806012310417965868',mailbox:'info@decasarre.test',website:'https://decasarre.es',domain:'decasarre.es',activity:'Comercialización de vinos y quesos',logo:'./decasarre-logo.png',accent:'#555a25'},
};
export function defaultProfile(id=storageWorkspaceId()):Profile{return {...(id==='arrea'||id==='decasarre'?BUILTIN_PROFILES[id]:DEFAULT_PROFILE)};}
export function validateProfile(value:unknown):Profile{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Los datos de la empresa no son válidos.');
 const p=value as Record<string,unknown>,s=(key:string,max:number)=>{const v=p[key];if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f<>]/.test(v))throw Error('Revisa el campo '+key+'.');return v.trim();};
 const name=s('name',120),shortName=s('shortName',60),nif=s('nif',20).toUpperCase(),ccc=s('ccc',20).replace(/\s/g,''),iban=s('iban',34).replace(/\s/g,'').toUpperCase(),mailbox=s('mailbox',120),activity=s('activity',180);
 if(!name||!shortName||!nif||!/^\d{11}$/.test(ccc)||!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)||!/^[-a-zA-Z0-9._+]+@[-a-zA-Z0-9.]+\.[a-zA-Z]{2,}$/.test(mailbox))throw Error('Indica la empresa, el NIF, un CCC de 11 cifras, un IBAN y un correo de prácticas.');
 const optional=(key:string,max:number,fallback:string)=>p[key]===undefined?fallback:s(key,max);
 const legalName=optional('legalName',120,name)||name,domain=optional('domain',253,mailbox.split('@')[1]),website=optional('website',500,''),logo=optional('logo',1000,DEFAULT_PROFILE.logo),accent=optional('accent',7,DEFAULT_PROFILE.accent).toLowerCase();
 if(!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(domain)||!/^#[a-f0-9]{6}$/.test(accent))throw Error('Revisa el dominio y el color de la empresa.');
 const safeUrl=(value:string,httpsOnly=false)=>{try{const url=new URL(value);return (httpsOnly?url.protocol==='https:':['https:','http:'].includes(url.protocol))&&!url.username&&!url.password;}catch{return false;}};
 if(website&&!safeUrl(website))throw Error('La web debe ser una dirección http o https sin credenciales.');
 if(!['./empresa.svg','./arrea-logo.png','./decasarre-logo.png'].includes(logo)&&!safeUrl(logo,true))throw Error('El logotipo debe ser un recurso del aula o una imagen https.');
 return {...DEFAULT_PROFILE,name,legalName,shortName,nif,ccc,iban,mailbox,activity,domain,website,logo,accent};
}
export function getProfile(id=storageWorkspaceId()):Profile{try{const raw=workspaceStorage(id).getItem('profile');return raw?validateProfile(JSON.parse(raw)):defaultProfile(id);}catch{return defaultProfile(id);}}
export function saveProfile(profile:unknown,id=storageWorkspaceId()){const p=validateProfile(profile);workspaceStorage(id).setItem('profile',JSON.stringify(p));return p;}
