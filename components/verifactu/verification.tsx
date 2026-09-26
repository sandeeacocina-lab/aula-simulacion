import {useEffect,useState} from 'react';
import {AulaFooter} from '../home';
import {Button} from '../ui/button';
import {companyUrl} from '../../lib/company-client';
import {listWorkspaces} from '../../lib/local/workspaces';
import {checkChain,listInvoices,listRecords} from '../../lib/verifactu/store';
import {lookupRegistry} from '../../lib/verifactu/registry';
import {displayDate,fullNumber,money,totals} from '../../lib/verifactu/model';
import {matchesRegistryInvoice,type RegistryInvoice} from '../../services/verifactu-registry/protocol';

type Result={ok:boolean;message:string;detail?:string;receivedAt?:string;signed?:boolean};
const statuses={Correcto:'Registro correcto',AceptadoConErrores:'Registro aceptado con errores',Incorrecto:'Registro rechazado'};
export default function Verification(){
 const params=new URLSearchParams(window.location.hash.split('?')[1]),practice=params.get('practica'),[state,setState]=useState<Result>(),[busy,setBusy]=useState(true),[attempt,setAttempt]=useState(0);
 const expected:RegistryInvoice={id:params.get('cotejo')||'',nif:params.get('nif')||'',number:params.get('numero')||'',date:params.get('fecha')||'',total:params.get('total')||''};
 const query=window.location.hash;
 useEffect(()=>{
  let alive=true;setBusy(true);setState(undefined);
  void(async()=>{
   let result:Result;
   try{
    if(practice){
     // Never replace an unavailable shared result with a potentially stale local
     // success: another device may have recorded an annulment in the meantime.
     const r=await lookupRegistry(practice,expected.id);
     if(!matchesRegistryInvoice(r.invoice,expected))result={ok:false,message:'Los datos del QR no coinciden con la factura registrada.'};
     else if(r.kind==='anulacion')result={ok:false,message:'Factura anulada en la simulación.',detail:'El registro compartido conserva la anulación de esta factura.',receivedAt:r.receivedAt,signed:r.signed};
     else if(r.status==='Incorrecto')result={ok:false,message:'El registro de esta factura está rechazado.',detail:'La práctica todavía no ha enviado una subsanación aceptada.',receivedAt:r.receivedAt,signed:r.signed};
     else result={ok:true,message:'Factura encontrada en el registro compartido.',detail:statuses[r.status],receivedAt:r.receivedAt,signed:r.signed};
    }else{
     result={ok:false,message:'Este navegador no dispone de una práctica con ese registro.',detail:'Este QR corresponde a la consulta local. En el navegador que emitió la factura, envía sus registros al registro compartido y descarga de nuevo el PDF para obtener el QR actualizado.'};
     for(const w of listWorkspaces()){
      const row=(await listInvoices(w.id)).find(r=>r.invoice.id===expected.id);if(!row)continue;
      const i=row.invoice,records=await listRecords(w.id),last=records.filter(r=>r.invoiceId===i.id).at(-1);
      const matches=matchesRegistryInvoice({id:i.id,nif:i.issuer.nif,number:fullNumber(i),date:i.date,total:totals(i).total.toFixed(2)},expected);
      if(!matches)result={ok:false,message:'Los datos del QR no coinciden con la factura guardada.'};
      else if(!checkChain(records))result={ok:false,message:'La cadena de registros no supera la comprobación de integridad.'};
      else if(!last||last.status==='Incorrecto')result={ok:false,message:'Esta factura no tiene un registro aceptado en la práctica.'};
      else if(last.kind==='anulacion')result={ok:false,message:'Factura anulada en la simulación.',detail:last.payload.reason};
      else result={ok:true,message:'Factura encontrada en esta práctica.',detail:statuses[last.status]+' · Consulta local · '+w.profile.shortName};
      break;
     }
    }
   }catch(e){result={ok:false,message:'No se ha podido confirmar el registro.',detail:(e as Error).message};}
   if(alive){setState(result);setBusy(false);}
  })();return()=>{alive=false;};
 },[query,attempt]);
 return <div className="aula vf"><header className="vf-sede"><img src="./aeat.svg" alt="Agencia Tributaria, referencia de la simulación"/><span>REGISTRO DE FACTURAS · SIMULACIÓN DOCENTE</span><a href="#/">Central de simulación</a></header><main className="aula-main vf-check"><p className="aula-eyebrow">VERI*FACTU · COTEJO SIMULADO</p><h1>Consulta de factura</h1><section className={'vf-panel '+(state?.ok?'vf-found':'')}><h2 role="status">{busy?'Consultando el registro…':state?.message}</h2>{state?.detail&&<p>{state.detail}</p>}{state?.receivedAt&&<p className="vf-hint">Última recepción en el registro: {new Date(state.receivedAt).toLocaleString('es-ES')}. {state.signed?'Firma simulada registrada.':'Registro anterior a la captura de firma.'}</p>}<dl className="vf-facts">{[['NIF emisor',expected.nif],['Factura',expected.number],['Fecha',displayDate(expected.date)],['Total',/^-?\d+\.\d{2}$/.test(expected.total)?money(Number(expected.total)):expected.total]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section><p>Simulación docente. La consulta confirma la recepción de datos en la central de prácticas. Sin comunicación con la AEAT.</p>{practice&&!busy&&!state?.ok&&<Button variant="outline" onClick={()=>setAttempt(a=>a+1)}>Reintentar consulta</Button>}<Button asChild><a href={companyUrl('/servicios/agencia-tributaria/verifactu')}>Volver a facturación</a></Button><Button variant="outline" asChild><a href={companyUrl('/practicas')}>Mi práctica</a></Button></main><AulaFooter/></div>;
}
