import {XMLParser,XMLValidator} from 'fast-xml-parser';
import type {ContractField,SepeContract,SepeParsed} from './sepe-types';

export class SepeError extends Error{status:number;batchId?:string;constructor(message:string,status=400,batchId?:string){super(message);this.status=status;this.batchId=batchId;}}
const MAX_BYTES=1024*1024;
const labels:Record<string,string>={
 DATOS_EMPRESA:'Empresa',CIF_NIF_EMPRESA:'Identificación de empresa',CIF_NIF:'NIF de la empresa',CODIGO_CUENTA_COTIZACION:'Cuenta de cotización',
 DATOS_TRABAJADOR:'Trabajador/a',IDENTIFICADORPFISICA:'Identificador de persona física',NOMBRE_APELLIDOS:'Nombre y apellidos',NOMBRE:'Nombre',PRIMER_APELLIDO:'Primer apellido',SEGUNDO_APELLIDO:'Segundo apellido',
 SEXO:'Sexo (código)',FECHA_NACIMIENTO:'Fecha de nacimiento',NACIONALIDAD:'Nacionalidad (código)',MUNICIPIO_RESIDENCIA:'Municipio de residencia (código)',PAIS_RESIDENCIA:'País de residencia (código)',
 DATOS_GENERALES_CONTRATO:'Contrato',FECHA_INICIO:'Fecha de inicio',FECHA_FIN:'Fecha de fin',NIVEL_FORMATIVO:'Nivel formativo (código)',CODIGO_OCUPACION:'Ocupación (código)',NACIONALIDAD_CT:'País del centro de trabajo (código)',MUNICIPIO_CT:'Municipio del centro de trabajo (código)',INDICATIVO_PRTR:'Indicador PRTR',DATOS_PRESTACIONES:'Prestaciones',IND_ERE:'Indicador ERE',
};
const label=(key:string)=>labels[key]||key.toLocaleLowerCase('es').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function sepeValidDate(value:unknown,title='la fecha'):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new SepeError('Revisa '+title+'.');
 const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value||value<'1900-01-01'||value>'2199-12-31')throw new SepeError('Revisa '+title+': no es una fecha válida.');return value;
}
function xmlDate(v:string,title:string,optional=false){if(!v&&optional)return '';return sepeValidDate(/^\d{8}$/.test(v)?v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8):v,title);}
function node(v:unknown,title:string):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new SepeError('Falta o está repetido el bloque '+title+'.');return v as Record<string,unknown>;}
function scalar(v:unknown,title:string,optional=false,max=160){if((v===undefined||v==='')&&optional)return '';if(typeof v!=='string'||!v.trim()||v.length>max)throw new SepeError('Falta o no es válido el campo '+title+'.');return v.trim();}
function fieldsOf(root:Record<string,unknown>):ContractField[]{
 const out:ContractField[]=[];
 function walk(v:unknown,path:string[],depth=0){
  if(depth>18||out.length>600)throw new SepeError('El contrato contiene demasiados campos o niveles.');
  if(Array.isArray(v)){v.forEach((entry,i)=>walk(entry,[...path.slice(0,-1),path.at(-1)+' ['+(i+1)+']'],depth+1));return;}
  if(v&&typeof v==='object'){for(const [key,value] of Object.entries(v)){if(key.startsWith('@_')&&key.includes('xmlns'))continue;walk(value,[...path,key],depth+1);}return;}
  const value=String(v??'').trim();if(value.length>2000)throw new SepeError('Hay un campo de texto demasiado largo.');
  if(value)out.push({path:path.join('/'),group:label(path[0]),label:path.slice(1).map(key=>label(key.replace(/^@_/,''))).join(' · ')||label(path[0]),value});
 }
 walk(root,[]);return out;
}
export function decodeContractXml(bytes:Uint8Array):{xml:string;encoding:string}{
 if(!bytes.length||bytes.length>MAX_BYTES)throw new SepeError('Selecciona un XML de hasta 1 MB.',413);
 const head=new TextDecoder('ascii').decode(bytes.slice(0,220));const declared=head.match(/<\?xml[^>]*encoding\s*=\s*['"]([^'"]+)['"]/i)?.[1].toLowerCase()||'utf-8';
 const encoding=declared==='utf8'?'utf-8':declared;
 if(!['utf-8','iso-8859-1','windows-1252'].includes(encoding))throw new SepeError('La codificación del XML no es compatible. Exporta el archivo en UTF-8 o ISO-8859-1.');
 try{return {xml:new TextDecoder(encoding,{fatal:true}).decode(bytes),encoding};}catch{throw new SepeError('No se pueden leer los caracteres del XML. Vuelve a exportarlo desde el programa de nóminas.');}
}
export function parseContractXml(bytes:Uint8Array):SepeParsed{
 const {xml,encoding}=decodeContractXml(bytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new SepeError('El fichero no puede incluir DTD ni entidades externas.');
 // Bound nesting before parsing, as well as bytes and fields after parsing.
 let depth=0,tags=0;for(const m of xml.matchAll(/<\/?[A-Za-z_][^>]*>/g)){if(++tags>30000)throw new SepeError('El XML contiene demasiados elementos.');if(m[0].startsWith('</'))depth--;else if(!m[0].endsWith('/>'))depth++;if(depth>22)throw new SepeError('El XML contiene demasiados niveles.');}
 if(XMLValidator.validate(xml)!==true)throw new SepeError('El archivo no es un XML bien formado. Vuelve a exportarlo desde NominaSol.');
 let parsed:Record<string,unknown>;try{parsed=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,trimValues:true,processEntities:true,ignoreDeclaration:true}).parse(xml);}catch{throw new SepeError('No se ha podido leer el XML.');}
 const roots=Object.keys(parsed).filter(k=>!k.startsWith('?'));
 if(roots.length!==1||roots[0]!=='CONTRATOS')throw new SepeError('Este fichero no es una comunicación inicial de contratos. Selecciona el XML de contratos de NominaSol; las remesas bancarias y las variaciones usan otros formatos.');
 const root=node(parsed.CONTRATOS,'CONTRATOS'),contracts:SepeContract[]=[],warnings=new Set<string>();
 for(const [key,entries] of Object.entries(root)){
  if(key.startsWith('@_'))continue;
  if(!/^CONTRATO_\d{3}$/.test(key))throw new SepeError('El fichero incluye un trámite que todavía no se puede importar: '+label(key)+'. No se ha registrado ningún contrato.');
  for(const entry of Array.isArray(entries)?entries:[entries]){
   if(contracts.length>=50)throw new SepeError('Cada fichero puede contener hasta 50 contratos.');
   const c=node(entry,key),company=node(c.DATOS_EMPRESA,'Empresa'),worker=node(c.DATOS_TRABAJADOR,'Trabajador/a'),general=node(c.DATOS_GENERALES_CONTRATO,'Contrato'),names=node(worker.NOMBRE_APELLIDOS,'Nombre y apellidos');
   const employerId=scalar(node(company.CIF_NIF_EMPRESA,'NIF de empresa').CIF_NIF,'NIF de empresa',false,30),ccc=scalar(company.CODIGO_CUENTA_COTIZACION,'cuenta de cotización',false,30),personId=scalar(worker.IDENTIFICADORPFISICA,'identificador de persona física',false,30);
   const name=[scalar(names.NOMBRE,'nombre'),scalar(names.PRIMER_APELLIDO,'primer apellido'),scalar(names.SEGUNDO_APELLIDO,'segundo apellido',true)].filter(Boolean).join(' ');
   const birthDate=xmlDate(scalar(worker.FECHA_NACIMIENTO,'fecha de nacimiento'),'la fecha de nacimiento'),startDate=xmlDate(scalar(general.FECHA_INICIO,'fecha de inicio'),'la fecha de inicio'),endDate=xmlDate(scalar(general.FECHA_FIN,'fecha de fin',true),'la fecha de fin',true);
   if(birthDate>=startDate)throw new SepeError('La fecha de nacimiento debe ser anterior al inicio del contrato de '+name+'.');
   if(endDate&&endDate<startDate)throw new SepeError('La fecha de fin es anterior al inicio del contrato de '+name+'.');
   const code=key.slice(-3),fields=fieldsOf(c),occupation=scalar(general.CODIGO_OCUPACION,'ocupación',true);
   if(!/^\d{14}$/.test(ccc))warnings.add('La cuenta de cotización de '+name+' no tiene los 14 dígitos del fichero de ejemplo. Comprueba el dato antes de continuar.');
   if(code!=='100')warnings.add('El contrato de '+name+' usa la modalidad '+code+'. Revisa todos sus campos: las condiciones específicas de esta modalidad no se comprueban automáticamente.');
   if(!occupation)warnings.add('No consta el código de ocupación de '+name+'.');
   contracts.push({line:contracts.length+1,code,employerId,ccc,personId,name,birthDate,startDate,endDate,occupation,fields});
  }
 }
 if(!contracts.length)throw new SepeError('No se han encontrado contratos en el XML.');
 if(new Set(contracts.map(contractIdentity)).size!==contracts.length)throw new SepeError('El fichero repite un mismo trabajador, empresa, modalidad y fecha de inicio. Revisa los contratos antes de importarlo.');
 if(new Set(contracts.map(c=>c.employerId)).size>1)warnings.add('El fichero contiene varias identificaciones de empresa. Todos los contratos se guardarán en el expediente de la empresa seleccionada.');
 return {contracts,warnings:[...warnings],encoding};
}
export function contractIdentity(c:SepeContract){return [c.employerId,c.personId,c.code,c.startDate].map(v=>v.replace(/\s/g,'').toUpperCase()).join('|');}
export function canonicalContracts(contracts:SepeContract[]){return JSON.stringify(contracts.map(c=>({key:contractIdentity(c),fields:c.fields.map(f=>[f.path,f.value]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]))})).sort((a,b)=>a.key.localeCompare(b.key)));}
