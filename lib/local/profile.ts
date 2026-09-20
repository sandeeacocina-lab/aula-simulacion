import {practiceStorage} from './storage';
export const DEFAULT_PROFILE={id:'demo',name:'Empresa de prácticas, S.L.',legalName:'Empresa de prácticas, S.L.',shortName:'Empresa de prácticas',nif:'B12345674',ccc:'28123456740',iban:'ES9121000418450200051332',mailbox:'administracion@empresa.test',website:'',domain:'empresa.test',activity:'Servicios y comercialización',logo:'./empresa.svg',accent:'#087f8c'};
export type Profile=typeof DEFAULT_PROFILE;
export function validateProfile(value:unknown):Profile{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Los datos de la empresa no son válidos.');
 const p=value as Record<string,unknown>,s=(key:string,max:number)=>{const v=p[key];if(typeof v!=='string'||v.length>max||/[\u0000-\u001f<>]/.test(v))throw Error('Revisa el campo '+key+'.');return v.trim();};
 const name=s('name',120),shortName=s('shortName',60),nif=s('nif',20).toUpperCase(),ccc=s('ccc',20).replace(/\s/g,''),iban=s('iban',34).replace(/\s/g,'').toUpperCase(),mailbox=s('mailbox',120),activity=s('activity',180);
 if(!name||!shortName||!nif||!/^\d{11}$/.test(ccc)||!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)||!/^[-a-zA-Z0-9._+]+@[-a-zA-Z0-9.]+\.[a-zA-Z]{2,}$/.test(mailbox))throw Error('Indica la empresa, el NIF, un CCC de 11 cifras, un IBAN y un correo de prácticas.');
 return {...DEFAULT_PROFILE,name,legalName:name,shortName,nif,ccc,iban,mailbox,activity,domain:mailbox.split('@')[1]};
}
export function getProfile():Profile{try{const raw=practiceStorage.getItem('profile');return raw?validateProfile(JSON.parse(raw)):DEFAULT_PROFILE;}catch{return DEFAULT_PROFILE;}}
export function saveProfile(profile:unknown){const p=validateProfile(profile);practiceStorage.setItem('profile',JSON.stringify(p));return p;}
