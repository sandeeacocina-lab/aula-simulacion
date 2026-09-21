// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within,act} from '@testing-library/react';
import {useState} from 'react';
import SepeWorkspace from '../components/sepe/sepe-workspace';
import {SignatureEditor} from '../components/mail/signature-editor';
import {sepeViewFromSearch,sepeViewSearch,sepeViewTitles} from '../lib/sepe-navigation';
import type {MailSignature} from '../lib/mail-signature';

vi.mock('../lib/company-client',()=>({
 clientCompany:()=>({id:'demo',name:'Empresa de pruebas',shortName:'Pruebas',mailbox:'info@pruebas.test',logo:'./empresa.svg',accent:'#087f8c'}),
 companyStorageKey:(key:string)=>key,
 companyUrl:(url:string)=>url.startsWith('/')?'#'+url:url,
 companyFetch:vi.fn(async()=>Response.json({batches:[],total:0,contractCount:0,page:0,pageSize:20})),
}));
beforeEach(()=>{window.history.replaceState({},'','/repositorio/?outer=kept#/servicios/sepe');window.scrollTo=vi.fn();HTMLElement.prototype.scrollIntoView=vi.fn();});
afterEach(cleanup);

it('normaliza vistas SEPE y conserva parámetros ajenos a su navegación',()=>{
 for(const [view,key] of [['services',''],['import','envio'],['history','consulta'],['models','modelos']] as const){
  const query=sepeViewSearch(view,'?foo=bar&envio=1&consulta=1&modelos=1');
  expect(sepeViewFromSearch(query)).toBe(view);
  const params=new URLSearchParams(query);expect(params.get('foo')).toBe('bar');
  expect([...params.keys()].filter(k=>k!=='foo')).toEqual(key?[key]:[]);
 }
 expect(sepeViewFromSearch('?consulta=bogus')).toBe('services');
});

it('ofrece tres gestiones y conserva filtros al usar migas, atrás y adelante',async()=>{
 render(<SepeWorkspace/>);
 expect(within(screen.getByRole('region',{name:'Servicios de contratos'})).getAllByRole('link')).toHaveLength(3);
 const menu=screen.getByRole('navigation',{name:'Servicios de contratación'});
 fireEvent.click(within(menu).getByRole('link',{name:'Consultar comunicaciones'}));
 expect(window.location.hash).toBe('#/servicios/sepe?consulta=1');
 expect(window.location.pathname).toBe('/repositorio/');
 expect(window.location.search).toBe('?outer=kept');
 fireEvent.change(screen.getByLabelText('Buscar comunicaciones'),{target:{value:'Marta'}});
 const crumb=screen.getByRole('navigation',{name:'Ruta de navegación'});
 fireEvent.click(within(crumb).getByRole('link',{name:'Contratos',exact:true}));
 expect(screen.getByRole('heading',{level:1}).textContent).toBe('Contratos');
 await act(async()=>{window.history.back();});
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(sepeViewTitles.history));
 expect(screen.getByLabelText('Buscar comunicaciones')).toHaveProperty('value','Marta');
 expect(document.title).toContain('Consulta de comunicaciones');
 await act(async()=>{window.history.forward();});
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe('Contratos'));
});

it('carga enlaces directos de envío/modelos desde el hash y no usa el query exterior',async()=>{
 window.history.replaceState({},'','/repositorio/?consulta=1#/servicios/sepe?envio=1');
 render(<SepeWorkspace/>);
 expect(screen.getByRole('heading',{level:1}).textContent).toBe(sepeViewTitles.import);
 expect(screen.getByRole('region',{name:'Envío de ficheros'})).toBeTruthy();
 act(()=>{window.location.hash='/servicios/sepe?modelos=1';window.dispatchEvent(new HashChangeEvent('hashchange'));});
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(sepeViewTitles.models));
 fireEvent.click(screen.getByRole('button',{name:'Consultar y descargar modelos'}));
 const dialog=await screen.findByRole('dialog');
 expect(within(dialog).getByRole('link',{name:'Ir al SEPE'})).toHaveProperty('target','_blank');
});

it('añade una firma opcional editable y no inventa un logo para una empresa personalizada',()=>{
 function Editor(){const [signature,setSignature]=useState<MailSignature|null>(null);return <SignatureEditor value={signature} senderName="Empresa Personalizada" senderAddress="info@personalizada.test" onChange={setSignature}/>;}
 render(<Editor/>);
 expect(screen.queryByLabelText('Nombre y apellidos')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Añadir firma'}));
 expect(screen.getByLabelText('Empresa o entidad')).toHaveProperty('value','Empresa Personalizada');
 expect(screen.getByLabelText('Correo de la firma')).toHaveProperty('value','info@personalizada.test');
 expect(screen.queryByRole('img')).toBeNull();
 fireEvent.change(screen.getByLabelText('Empresa o entidad'),{target:{value:'DECASARRE'}});
 expect(screen.getByRole('img',{name:'DECASARRE'})).toHaveProperty('src',expect.stringContaining('/decasarre-logo.png'));
 fireEvent.click(screen.getByRole('button',{name:'Quitar firma'}));
 expect(screen.queryByLabelText('Nombre y apellidos')).toBeNull();
});
