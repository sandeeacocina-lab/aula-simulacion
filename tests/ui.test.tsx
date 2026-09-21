// @vitest-environment jsdom
import {beforeAll,beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/react';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {webcrypto} from 'node:crypto';
import Home,{CompanyHome} from '../components/home';
import Tax from '../components/tributaria/tax-workspace';
import Bank from '../components/bank/bank-workspace';
import {setEngineForTests,freshDatabase,persistDatabase} from '../lib/local/runtime';
import {localRequest} from '../lib/local/dispatch';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
Object.assign(globalThis,{indexedDB,ResizeObserver:class{observe(){}unobserve(){}disconnect(){}}});
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}))});
window.scrollTo=vi.fn();HTMLElement.prototype.scrollIntoView=vi.fn();
beforeAll(async()=>{setEngineForTests(await initSqlJs());});
beforeEach(async()=>{localStorage.clear();const db=await freshDatabase();await persistDatabase(db.export(),{replaceFiles:true});db.close();});
afterEach(cleanup);
it('ofrece cinco accesos independientes y una ruta para cambiar de empresa',()=>{
 render(<CompanyHome/>);const services=screen.getByRole('region',{name:'Servicios disponibles'});expect(within(services).getAllByRole('link')).toHaveLength(5);expect(screen.getByRole('link',{name:'Cambiar empresa'}).getAttribute('href')).toBe('#/');
});
it('muestra las dos empresas y permite preparar una nueva sin flechas de navegación',()=>{
 render(<Home/>);expect(screen.getByRole('button',{name:'Entrar en ARREA Eventos'})).toBeTruthy();expect(screen.getByRole('button',{name:'Entrar en DECASARRE'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Crear otra empresa'}));
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByLabelText('Razón social')).toHaveProperty('value','');expect(screen.getByLabelText('NIF de prácticas')).toHaveProperty('value','B12345674');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(screen.queryByRole('dialog')).toBeNull();
});
it('abre una cuenta desde el formulario y guarda el saldo en la práctica local',async()=>{
 render(<Bank/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir cuenta de prácticas'}));
 fireEvent.change(screen.getByLabelText('Saldo inicial (€)'),{target:{value:'1500'}});
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Crear cuenta'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 const state=await (await localRequest('/api/banco')).json();expect(state.account.balance).toBe(150000);expect(screen.getByText('Saldo disponible')).toBeTruthy();
});
it('presenta un modelo 303 con confirmación, conserva el justificante y permite borrarlo',async()=>{
 render(<div className="tax-app"><Tax/></div>);
 fireEvent.click(screen.getAllByRole('button',{name:/Modelo 303\./})[0]);fireEvent.click(screen.getByRole('button',{name:/Modelo 303\. Ejercicio 2026. Presentación/}));
 fireEvent.click(screen.getByRole('button',{name:/Certificado o DNI electrónico/}));fireEvent.click(screen.getByRole('button',{name:'Aceptar',exact:true}));
 expect(screen.getByLabelText('NIF *')).toHaveProperty('value','B12345674');
 fireEvent.click(screen.getByRole('button',{name:'Aceptar y continuar'}));fireEvent.change(screen.getByLabelText(/^Casilla 07:/),{target:{value:'1000'}});
 fireEvent.click(screen.getByRole('button',{name:'Presentar declaración',exact:true}));
 fireEvent.change(screen.getByLabelText('Código IBAN de prácticas'),{target:{value:'ES0000000000000000000000'}});
 fireEvent.click(screen.getByRole('button',{name:'Firmar y enviar',exact:true}));
 const dialog=screen.getByRole('dialog'),send=within(dialog).getByRole('button',{name:'Firmar y enviar'});expect(send).toHaveProperty('disabled',true);
 fireEvent.click(within(dialog).getByRole('checkbox'));fireEvent.click(send);
 expect(await screen.findByRole('heading',{name:'Su presentación ha sido realizada con éxito'})).toBeTruthy();
 const records=JSON.parse(localStorage.getItem('aula-simulacion:v1:aula-presentaciones-v1')||'[]');expect(records).toHaveLength(1);expect(records[0].result).toBe(210);
 fireEvent.click(screen.getByRole('button',{name:'Consultar mis presentaciones'}));fireEvent.click(screen.getByRole('button',{name:/^Borrar: Modelo 303/}));
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar borrado'}));await waitFor(()=>expect(JSON.parse(localStorage.getItem('aula-simulacion:v1:aula-presentaciones-v1')||'[]')).toHaveLength(0));
});
