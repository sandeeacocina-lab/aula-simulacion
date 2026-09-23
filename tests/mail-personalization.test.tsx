// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import MailWorkspace from '../components/mail/mail-workspace';
import {mailScenarios} from '../lib/mail-scenarios';
import {companyFetch} from '../lib/company-client';
vi.mock('../lib/local/workspaces',()=>({getWorkspaceId:()=> 'decasarre'}));
vi.mock('../lib/company-client',()=>({
 clientCompany:()=>({id:'demo',name:'DECASARRE',shortName:'DECASARRE',mailbox:'info@decasarre.test',logo:'./decasarre-logo.png',accent:'#555a25'}),
 companyStorageKey:(key:string)=>key,companyUrl:(url:string)=>'#'+url,shouldRefresh:()=>false,
 companyFetch:vi.fn(async(_url:string,init?:RequestInit)=>Response.json(init?.method==='POST'?{message:{id:'saved'}}:{messages:[],total:0,counts:{inbox:0,sent:0,drafts:0,archive:0,trash:0},unread:0,page:0,pageSize:40})),
}));
beforeEach(()=>{vi.clearAllMocks();window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(cleanup);
it('ofrece plantillas de vinos y quesos y mantiene genéricas las empresas nuevas',()=>{
 expect(mailScenarios('decasarre').map(s=>s.subject+' '+s.body).join(' ')).toContain('vinos y quesos');
 expect(mailScenarios('decasarre').map(s=>s.body).join(' ')).not.toMatch(/ARREA|jornada|audiovisual/i);
 expect(mailScenarios('custom-example').map(s=>s.subject+' '+s.body).join(' ')).not.toMatch(/ARREA|DECASARRE|eventos|quesos/);
});
it('recibe un correo libre con remitente, asunto y texto elegidos por la docente',async()=>{
 render(<MailWorkspace/>);
 fireEvent.click(await screen.findByRole('button',{name:'Recibir un mensaje de prácticas',exact:true}));
 const dialog=await screen.findByRole('dialog');expect(within(dialog).getByRole('combobox',{name:'Tipo de mensaje recibido'}).textContent).toContain('Correo personalizado');
 expect(within(dialog).getByLabelText('Nombre del remitente')).toHaveProperty('value','');
 for(const [name,value] of [['Nombre del remitente','Dirección DECASARRE'],['Correo del remitente','direccion@decasarre.test'],['Asunto','Documentación del encargo 2'],['Mensaje','La documentación está disponible en la bandeja.']])fireEvent.change(within(dialog).getByLabelText(name),{target:{value}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Recibir en la bandeja',exact:true}));
 await waitFor(()=>expect(vi.mocked(companyFetch).mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
 const init=vi.mocked(companyFetch).mock.calls.find(([,init])=>init?.method==='POST')![1]!;
 expect(JSON.parse(String(init.body))).toMatchObject({action:'receive',senderName:'Dirección DECASARRE',senderAddress:'direccion@decasarre.test',subject:'Documentación del encargo 2',body:'La documentación está disponible en la bandeja.'});
});
