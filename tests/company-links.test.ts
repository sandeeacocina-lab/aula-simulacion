// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {companyUrl} from '../lib/company-client';
import {selectWorkspace} from '../lib/local/workspaces';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
it('incluye la empresa en enlaces y descargas para abrirlos en otra pestaña',()=>{
 selectWorkspace('decasarre');
 const link=companyUrl('/servicios/banco/financiacion?id=local-1');
 const params=new URLSearchParams(link.split('?')[1]);
 expect(link.split('?')[0]).toBe('#/servicios/banco/financiacion');
 expect(params.get('id')).toBe('local-1');expect(params.get('empresa')).toBe('decasarre');
 const download=companyUrl('/api/correo/exportar?id=one&format=eml'),outer=new URLSearchParams(download.split('?')[1]);
 expect(outer.get('empresa')).toBe('decasarre');expect(outer.get('url')).toBe('/api/correo/exportar?id=one&format=eml');
 expect(companyUrl('/')).toBe('#/servicios?empresa=decasarre');
 expect(companyUrl('https://sepe.es/')).toBe('https://sepe.es/');expect(companyUrl('#contenido')).toBe('#contenido');
});
