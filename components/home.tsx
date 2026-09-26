import {useState,type CSSProperties,type FormEvent} from 'react';
import {Building2,FolderOpen,Mail,Settings2,ShieldCheck,Wallet,Plus} from 'lucide-react';
import {clientCompany,companyUrl} from '@/lib/company-client';
import {DEFAULT_PROFILE,type Profile} from '@/lib/local/profile';
import {createWorkspace,listWorkspaces,selectWorkspace} from '@/lib/local/workspaces';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';

export function AulaHeader({selector=false}:{selector?:boolean}){
 const company=clientCompany();
 return <header className="aula-header workspace-header">
  <a href={selector?'#/':companyUrl('/')} className="aula-brand">
   {selector?<span><Building2 size={25}/></span>:<img className="workspace-brand-logo" src={company.logo} alt=""/>}
   <strong>{selector?'Aula de':company.shortName}<span>{selector?'simulación empresarial':'Oficina virtual'}</span></strong>
  </a>
  {selector?<span className="workspace-educational"><ShieldCheck size={16}/>Simulación educativa</span>:<nav aria-label="Navegación del aula">
   <Button variant="outline" asChild><a href="#/">Cambiar empresa</a></Button>
   <Button variant="outline" asChild><a href={companyUrl('/')}>Servicios</a></Button>
   <Button variant="outline" asChild><a href={companyUrl('/practicas')}><Settings2 size={17}/>Mi práctica</a></Button>
  </nav>}
 </header>;
}
export function AulaFooter(){return <footer className="aula-footer"><div><strong>Aula de simulación empresarial</strong><p>Simulación educativa · Sin validez administrativa ni movimientos de dinero real.</p></div><p>Autoría y dirección pedagógica: Sandra Mangas.{' '}<br/>Desarrollo con asistencia de inteligencia artificial.</p></footer>;}

const companyFields:[keyof Profile,string,number][]=[['name','Razón social',120],['shortName','Nombre comercial',60],['nif','NIF de prácticas',20],['ccc','Código de cuenta de cotización',20],['iban','IBAN inicial de prácticas',34],['mailbox','Correo de empresa',120],['activity','Actividad',180]];
export default function Home(){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[profile,setProfile]=useState({...DEFAULT_PROFILE,name:'',shortName:''});
 const workspaces=listWorkspaces();
 function enter(id:string){try{selectWorkspace(id);window.location.hash=companyUrl('/');window.location.reload();}catch(e){setError((e as Error).message);}}
 function create(e:FormEvent){e.preventDefault();try{const workspace=createWorkspace({...profile,legalName:profile.name,domain:profile.mailbox.split('@')[1]});enter(workspace.id);}catch(e){setError((e as Error).message);}}
 return <div className="aula workspace-picker"><AulaHeader selector/><main id="contenido" className="aula-main">
  <section className="workspace-welcome"><p className="aula-eyebrow">APRENDER HACIENDO</p><h1>Tu empresa.<br/>Tu próxima experiencia.</h1><p>Elige una empresa y entra en su central de servicios.<br/>También puedes crear la tuya para un nuevo proyecto.</p></section>
  <div className="aula-section-title"><h2>¿Con qué empresa trabajamos?</h2><span>Un espacio propio para cada práctica</span></div>
  {error&&!open&&<p className="aula-error" role="alert">{error}</p>}
  <section className="workspace-grid" aria-label="Empresas disponibles">
   {workspaces.map(workspace=><article className="workspace-card" key={workspace.id} style={{'--company-accent':workspace.profile.accent} as CSSProperties}>
    <div className="workspace-card-image"><img src={workspace.profile.logo} alt={workspace.profile.shortName}/></div>
    <div className="workspace-card-body"><span className="workspace-card-label">{workspace.kind==='legacy'?'PRÁCTICA ANTERIOR':'EMPRESA SIMULADA'}</span><h3>{workspace.profile.name}</h3><p>{workspace.profile.activity}</p><Button onClick={()=>enter(workspace.id)} aria-label={'Entrar en '+workspace.profile.name}>Entrar en la empresa</Button></div>
   </article>)}
   <article className="workspace-card workspace-new"><div className="workspace-new-icon"><Plus size={32}/></div><h3>Tu propia empresa</h3><p>Prepara un espacio de trabajo con los datos de tu proyecto.</p><Button variant="outline" onClick={()=>{setError('');setOpen(true);}}>Crear otra empresa</Button></article>
  </section>
  <section className="aula-practice-info"><div><FolderOpen size={27}/><div><h2>Tu trabajo se queda contigo.</h2><p>Cada empresa conserva sus registros en este navegador. Descarga la práctica desde su oficina para entregarla o continuar en otro equipo.</p></div></div></section>
  <p className="aula-local-note">Acceso libre, sin registro. Utiliza datos ficticios. Si compartes ordenador y perfil de navegador, compartes también las prácticas.</p>
 </main><AulaFooter/>
 <Dialog open={open} onOpenChange={value=>{setOpen(value);setError('');}}><DialogContent className="workspace-create"><DialogTitle>Crear una empresa</DialogTitle><DialogDescription>Elige un nombre y revisa los datos de ejemplo. Podrás cambiarlos después en Mi práctica.</DialogDescription><form onSubmit={create}>
  {error&&<p className="aula-error" role="alert">{error}</p>}
  <div className="aula-fields">{companyFields.map(([key,label,max])=><label key={key}>{label}<input value={profile[key]} maxLength={max} required onChange={e=>setProfile({...profile,[key]:e.target.value})}/></label>)}</div>
  <div className="aula-dialog-actions"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit">Crear y entrar</Button></div>
 </form></DialogContent></Dialog></div>;
}

const services=[
 {id:'documentation',path:'/servicios/documentacion',kind:'DOCUMENTOS DE TRABAJO',title:'Bandeja de documentación',description:'Abre los encargos, revisa los documentos y organiza el trabajo de tu empresa.',action:'Abrir la bandeja',image:<><FolderOpen size={43}/><div><strong>Documentación</strong><small>ENCARGOS Y ARCHIVO</small></div></>},
 {id:'tax',path:'/servicios/agencia-tributaria',kind:'SEDE ELECTRÓNICA',title:'Agencia Tributaria',description:'Emite facturas con QR en VERI*FACTU y presenta autoliquidaciones y declaraciones informativas.',action:'Acceder a la sede',image:<img src="./aeat.svg" alt="Agencia Tributaria"/>},
 {id:'social',path:'/servicios/seguridad-social',kind:'SEDE ELECTRÓNICA',title:'Seguridad Social',description:'Inscribe empresas, afilia trabajadores y presenta documentos de cotización RNT y RLC.',action:'Acceder a la sede',image:<img src="./seguridad-social.svg" alt="Seguridad Social"/>},
 {id:'sepe',path:'/servicios/sepe',kind:'CONTRATACIÓN',title:'SEPE · Contrat@',description:'Comunica contratos mediante XML, consulta las comunicaciones y accede a los modelos oficiales.',action:'Acceder a la sede',image:<img src="./sepe/sepe-logo.png" alt="Servicio Público de Empleo Estatal"/>},
 {id:'bank',path:'/servicios/banco',kind:'OFICINA BANCARIA',title:'Banca de empresa',description:'Cobros, pagos, remesas, nóminas, domiciliaciones y financiación. Gestiona tu tesorería.',action:'Entrar en la banca',image:<><Wallet size={32}/><strong>nexo<span>.</span></strong><small>BANCA DE EMPRESAS</small></>},
 {id:'mail',path:'/servicios/correo',kind:'BUZÓN DE PRÁCTICAS',title:'Correo de empresa',description:'Atiende consultas, responde a clientes y proveedores y prepara mensajes con firma y adjuntos.',action:'Abrir el correo',image:<><Mail size={43}/><div><strong>Correo</strong><small>COMUNICACIÓN PROFESIONAL</small></div></>},
];
export function CompanyHome(){const company=clientCompany(),[details,setDetails]=useState(false);return <div className="aula company-office" style={{'--company-accent':company.accent} as CSSProperties}><AulaHeader/><main id="contenido" className="aula-main">
 <section className="workspace-office-intro"><div><p className="aula-eyebrow">{company.shortName} · OFICINA VIRTUAL</p><h1>Central de servicios</h1><p>Los trámites y las decisiones de tu empresa, en un mismo lugar.</p></div><Button variant="outline" aria-expanded={details} aria-controls="workspace-company-data" onClick={()=>setDetails(!details)}>{details?'Ocultar datos de la empresa':'Datos de la empresa'}</Button></section>
 {details&&<section id="workspace-company-data" className="workspace-company-data" aria-label="Datos de la empresa"><dl><div><dt>Razón social</dt><dd>{company.legalName}</dd></div><div><dt>NIF</dt><dd>{company.nif}</dd></div><div><dt>CCC</dt><dd>{company.ccc}</dd></div><div><dt>Correo</dt><dd>{company.mailbox}</dd></div></dl><Button variant="outline" asChild><a href={companyUrl('/practicas')}>Configurar empresa</a></Button></section>}
 <div className="aula-section-title"><h2>Oficinas y servicios</h2><span><ShieldCheck size={16}/>Simulación educativa</span></div>
 <section className="aula-services" aria-label="Servicios disponibles">{services.map(service=><article className={'aula-service '+service.id} key={service.id}><div className="aula-service-image">{service.image}</div><div className="aula-service-content"><span className="aula-service-kind">{service.kind}</span><h3>{service.title}</h3><p>{service.description}</p><Button variant="outline" asChild><a href={companyUrl(service.path)} aria-label={service.action+' · '+service.title}>{service.action}</a></Button></div></article>)}</section>
 <section className="aula-practice-info"><div><FolderOpen size={27}/><div><h2>Tu práctica, a tu ritmo.</h2><p>Los servicios son independientes: los trámites no generan movimientos bancarios. Descarga una copia para conservar tu trabajo o continuar en otro equipo.</p></div></div><Button variant="outline" asChild><a href={companyUrl('/practicas')}>Gestionar mi práctica</a></Button></section>
 <p className="aula-local-note">Empresa activa: {company.name}. Registros guardados solo en este navegador.</p>
 </main><AulaFooter/></div>;}
