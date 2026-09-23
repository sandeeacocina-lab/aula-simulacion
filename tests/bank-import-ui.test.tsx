// @vitest-environment jsdom
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {indexedDB} from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {webcrypto} from 'node:crypto';
import {Workbook} from 'exceljs';
import JSZip from 'jszip';
import {renderToStaticMarkup} from 'react-dom/server';
import Bank from '../components/bank/bank-workspace';
import {Receipt} from '../components/bank/receipt';
import {freshDatabase,persistDatabase,setEngineForTests} from '../lib/local/runtime';
import {localRequest} from '../lib/local/dispatch';
import {selectWorkspace} from '../lib/local/workspaces';
import {getProfile} from '../lib/local/profile';

Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
Object.assign(globalThis,{indexedDB,ResizeObserver:class{observe(){}unobserve(){}disconnect(){}}});
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}))});
window.scrollTo=vi.fn();
HTMLElement.prototype.scrollIntoView=vi.fn();

beforeAll(async()=>setEngineForTests(await initSqlJs()));
beforeEach(async()=>{
 localStorage.clear();selectWorkspace('arrea');
 const db=await freshDatabase();
 try{await persistDatabase(db.export(),{replaceFiles:true});}finally{db.close();}
 const response=await localRequest('/api/banco',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'setup',id:crypto.randomUUID(),amount:'1000',iban:getProfile().iban,bookingDate:'2026-09-01',consent:true})});
 expect(response.status,await response.text()).toBe(201);
});
afterEach(cleanup);

async function excelFile(rows:unknown[][]){
 const book=new Workbook();
 const sheet=book.addWorksheet('Movimientos');
 sheet.addRow(['Fecha','Concepto','Importe','Empresa','Referencia','Saldo EUR','Cuenta']);
 rows.forEach((row,index)=>sheet.addRow([...row,{formula:'SUM($C$2:C'+(index+2)+')'},'ES74 3180 6012 3108 3008 3056']));
 // Exercise valid prefixed SpreadsheetML, also used by the supplied DECASARRE file.
 const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());
 for(const entry of Object.values(zip.files)){
  if(entry.dir||!/^xl\/.*\.xml$/.test(entry.name))continue;
  let xml=await entry.async('string');
  if(!xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'))continue;
  xml=xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(/(<\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g,'$1x:$2');
  zip.file(entry.name,xml);
 }
 const bytes=await zip.generateAsync({type:'uint8array'});
 const file=new File([bytes],'practica.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 // jsdom File lacks arrayBuffer; supply the same actual XLSX bytes a browser reads.
 Object.defineProperty(file,'arrayBuffer',{value:async()=>bytes.slice().buffer});
 return file;
}
async function openImport(){
 render(<Bank/>);
 await screen.findByText('Saldo disponible');
 fireEvent.click(screen.getByRole('button',{name:'Importar Excel',exact:true}));
 await screen.findByLabelText('Seleccionar archivo .xlsx');
}
async function state(){return (await localRequest('/api/banco')).json();}

it('ignora fórmulas de saldo y cuenta propia, exige revisión, importa una vez y omite coincidencias al volver a cargarlo',async()=>{
 const file=await excelFile([
  ['02/09/2026','Cobro factura cliente',100,'Cliente prueba','F-001'],
  ['03/09/2026','Pago proveedor',-25,'Proveedor prueba','P-001'],
  ['02/09/2026','Cobro factura cliente',100,'Cliente prueba','F-001'],
 ]);
 await openImport();
 expect(screen.getByRole('link',{name:'Descargar plantilla Excel'}).getAttribute('href')).toContain('Plantilla_movimientos_bancarios.xlsx');
 fireEvent.change(screen.getByLabelText('Seleccionar archivo .xlsx'),{target:{files:[file]}});
 const review=await screen.findByRole('button',{name:'Revisar importación'});
 await waitFor(()=>expect(review).toHaveProperty('disabled',false));
 fireEvent.click(review);
 const confirm=await screen.findByRole('button',{name:'Confirmar importación'});
 expect(confirm).toHaveProperty('disabled',true);
 expect(screen.getAllByText('Se importará')).toHaveLength(2);
 expect(screen.getAllByText('Se omitirá')).toHaveLength(1);
 expect((await state()).movements).toHaveLength(1);
 fireEvent.click(screen.getByRole('checkbox',{name:'He revisado los datos ficticios, los importes y las coincidencias.'}));
 fireEvent.click(confirm);
 expect(await screen.findByText('2 movimientos incorporados.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Confirmar importación'})).toBeNull();
 const imported=await state();
 expect(imported.account.balance).toBe(107500);
 expect(imported.movements).toHaveLength(3);
 expect(imported.movements.map((row:any)=>row.concept)).toContain('Pago proveedor');
 expect(imported.movements.filter((row:any)=>row.concept==='Pago proveedor')[0].iban).toBe('');
 const receiptHref=screen.getByRole('link',{name:'Abrir justificante del lote'}).getAttribute('href')!;
 const batchId=new URLSearchParams(receiptHref.split('?')[1]).get('id');
 const receiptData=await (await localRequest('/api/banco?batch='+batchId)).json();
 const receipt=document.createElement('div');
 receipt.innerHTML=renderToStaticMarkup(<Receipt data={receiptData}/>);
 const receiptAmount=(label:string)=>Array.from(receipt.querySelectorAll('dt')).find(node=>node.textContent===label)?.nextElementSibling?.textContent?.replace(/\s/g,'');
 expect(receipt.textContent).toContain('Volumen total del lote');
 expect(receiptAmount('Total ingresos')).toBe('100,00€');
 expect(receiptAmount('Total gastos')).toBe('25,00€');
 expect(receiptAmount('Variación neta del saldo')).toBe('75,00€');
 expect(receipt.querySelector('tbody tr:last-child td:last-child')?.textContent?.replace(/\s/g,'')).toBe('-25,00€');
 fireEvent.click(screen.getByRole('button',{name:'Cuentas y movimientos'}));
 const extract=await screen.findByRole('table');
 await waitFor(()=>expect(within(extract).getByText('Cobro factura cliente')).toBeTruthy());
 expect(within(extract).getByText('Pago proveedor')).toBeTruthy();

 fireEvent.click(screen.getByRole('button',{name:'Importar Excel',exact:true}));
 fireEvent.change(await screen.findByLabelText('Seleccionar archivo .xlsx'),{target:{files:[file]}});
 fireEvent.click(await screen.findByRole('button',{name:'Revisar importación'}));
 expect(await screen.findByText('No hay movimientos nuevos que importar.')).toBeTruthy();
 expect(screen.getAllByText('Se omitirá')).toHaveLength(3);
 fireEvent.click(screen.getByRole('checkbox',{name:'He revisado los datos ficticios, los importes y las coincidencias.'}));
 expect(screen.getByRole('button',{name:'Confirmar importación'})).toHaveProperty('disabled',true);
 expect((await state()).account.balance).toBe(107500);
});

it('bloquea todo el archivo si una fila contiene una fórmula, aunque otras filas sean válidas',async()=>{
 const file=await excelFile([
  ['02/09/2026','Ingreso válido',100,'Cliente prueba','F-001'],
  ['03/09/2026','Importe calculado',{formula:'10+15',result:25},'Cliente prueba','F-002'],
 ]);
 await openImport();
 fireEvent.change(screen.getByLabelText('Seleccionar archivo .xlsx'),{target:{files:[file]}});
 const alert=await screen.findByRole('alert');
 expect(alert.textContent).toContain('contiene fórmulas');
 expect(screen.getByRole('button',{name:'Revisar importación'})).toHaveProperty('disabled',true);
 expect(screen.queryByRole('button',{name:'Confirmar importación'})).toBeNull();
 expect((await state()).account.balance).toBe(100000);
});
