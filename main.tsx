import {Component,lazy,Suspense,useEffect,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import Home from './components/home';
import './styles/base.css';
import './styles/banco.css';
import './styles/correo.css';
import './styles/sepe.css';
import './styles/social.css';
import './styles/tributaria.css';
import './styles/aula.css';
const Settings=lazy(()=>import('./components/settings'));
const Bank=lazy(()=>import('./components/bank/bank-workspace'));
const BankReceipt=lazy(()=>import('./components/bank/receipt'));
const FinanceReceipt=lazy(()=>import('./components/bank/finance-receipt'));
const Mail=lazy(()=>import('./components/mail/mail-workspace'));
const Tax=lazy(()=>import('./components/tributaria/tax-workspace'));
const Sepe=lazy(()=>import('./components/sepe/sepe-workspace'));
const SepeReceipt=lazy(()=>import('./components/sepe/receipt'));
const Social=lazy(()=>import('./components/social/social-home'));
const Contributions=lazy(()=>import('./components/social/social-workspace'));
const SocialReceipt=lazy(()=>import('./components/social/receipt'));
const Registry=lazy(()=>import('./components/social/registry-form'));
const RegistryHistory=lazy(()=>import('./components/social/registry-history'));
const routes:Record<string,ReactNode>={'/':<Home/>,'/practicas':<Settings/>,'/servicios/banco':<Bank/>,'/servicios/banco/justificante':<BankReceipt/>,'/servicios/banco/financiacion':<FinanceReceipt/>,'/servicios/correo':<Mail/>,'/servicios/agencia-tributaria':<div className="tax-app"><Tax/></div>,'/servicios/sepe':<Sepe/>,'/servicios/sepe/justificante':<SepeReceipt/>,'/servicios/seguridad-social':<Social/>,'/servicios/seguridad-social/cotizacion':<Contributions/>,'/servicios/seguridad-social/justificante':<SocialReceipt/>,'/servicios/seguridad-social/registros':<RegistryHistory/>,'/servicios/seguridad-social/empresas':<Registry kind="company"/>,'/servicios/seguridad-social/afiliacion':<Registry kind="person"/>,'/servicios/seguridad-social/altas':<Registry kind="employment"/>};
class Boundary extends Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<main className="aula-main"><h1>No se ha podido abrir esta pantalla.</h1><p>Recarga la página para volver a intentarlo. Los registros guardados se conservan.</p><a href="./">Volver al inicio</a></main>:this.props.children;}}
function DownloadPage({url}:{url:string}){
 const [error,setError]=useState(''),[ready,setReady]=useState(false),[preview,setPreview]=useState('');
 useEffect(()=>{let active=true,objectUrl='';void(async()=>{try{
  const {companyFetch}=await import('./lib/company-client'),r=await companyFetch(url);if(!r.ok)throw Error((await r.json()).error);
  const blob=await r.blob(),header=r.headers.get('Content-Disposition')||'',name=header.match(/filename\*=UTF-8''([^;]+)/i)?.[1],simple=header.match(/filename="([^"]+)"/)?.[1];
  if(!active)return;
  if(header.startsWith('inline')&&/^(application\/pdf|image\/(png|jpeg|webp))$/.test(blob.type)){objectUrl=URL.createObjectURL(blob);setPreview(objectUrl);}
  else{const {downloadBlob}=await import('./lib/local/backup');downloadBlob(blob,name?decodeURIComponent(name):simple||'justificante.pdf');}
  setReady(true);
 }catch(e){if(active)setError((e as Error).message);}})();return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[url]);
 return <main className="aula-main aula-file-preview"><h1>{error?'No se ha podido abrir':ready?'Archivo preparado':'Preparando el archivo…'}</h1><p role="status">{error||(ready&&!preview?'La descarga se ha iniciado. Puedes cerrar esta pestaña.':'')}</p>{preview&&<iframe title="Vista previa del adjunto" src={preview}/>}<a href="#/">Volver a los servicios</a></main>;
}
function App(){const [hash,setHash]=useState(window.location.hash||'#/');useEffect(()=>{const change=()=>{if(window.location.hash.startsWith('#/')){setHash(window.location.hash);window.scrollTo(0,0);}};const skip=(e:MouseEvent)=>{const a=(e.target as Element).closest?.('a'),href=a?.getAttribute('href');if(href?.startsWith('#')&&!href.startsWith('#/')){const target=document.getElementById(href.slice(1));if(target){e.preventDefault();target.scrollIntoView();target.setAttribute('tabindex','-1');target.focus();}}};window.addEventListener('hashchange',change);document.addEventListener('click',skip);return()=>{window.removeEventListener('hashchange',change);document.removeEventListener('click',skip);};},[]);const path=hash.slice(1).split('?')[0]||'/';return <Boundary key={hash}><Suspense fallback={<p className="company-loading" role="status">Abriendo el servicio…</p>}>{path==='/descargar'?<DownloadPage url={new URLSearchParams(hash.split('?')[1]).get('url')||''}/>:routes[path]||<main className="aula-main"><h1>No encontramos esa página.</h1><a href="#/">Volver al inicio</a></main>}</Suspense></Boundary>;}
export {App};
if(import.meta.env.MODE!=='test')createRoot(document.getElementById('root')!).render(<App/>);
