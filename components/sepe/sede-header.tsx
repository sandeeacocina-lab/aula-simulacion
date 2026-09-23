'use client';
import {companyUrl,clientCompany} from '@/lib/company-client';
import {Building2,ShieldCheck} from 'lucide-react';
import type {MouseEventHandler,MouseEvent} from 'react';
import type {SepeView} from '@/lib/sepe-navigation';

export function SepeIdentity(){
 return <div className="sepe-identity"><div className="sepe-government" role="img" aria-label="Gobierno de España · Ministerio de Trabajo y Economía Social"><span className="sepe-government-mark"><img src="./ss-ministerio.svg" width="262" height="59" alt=""/></span><span className="sepe-ministry-name">MINISTERIO<br/>DE TRABAJO<br/>Y ECONOMÍA SOCIAL</span></div><div className="sepe-emblem" aria-label="Servicio Público de Empleo Estatal · SEPE"><span>SERVICIO PÚBLICO<br/>DE EMPLEO ESTATAL</span><strong>SEPE</strong></div></div>;
}
export function SimulationNotice(){
 return <div className="sepe-training-strip"><ShieldCheck size={16} aria-hidden="true"/><strong>SIMULACIÓN EDUCATIVA</strong><span>Sin validez administrativa</span></div>;
}
export default function SedeHeader({onHome,onNavigate,onHelp}:{onHome?:MouseEventHandler<HTMLAnchorElement>;onNavigate?:(view:SepeView,e:MouseEvent<HTMLAnchorElement>)=>void;onHelp?:()=>void}){
 return <><div className="sepe-central-bar"><a href={companyUrl('/')}>Volver a los servicios</a><span>{clientCompany().name}</span></div><SimulationNotice/><header className="sepe-sede-header"><a href={companyUrl('/servicios/sepe')} onClick={onHome} aria-label="Inicio de la sede del SEPE"><SepeIdentity/></a><div className="sepe-sede-title">sede<span className="sepe-wordmark-e">e</span>lectrónica<small>Oficina Virtual</small></div><div className="sepe-header-account"><span>Castellano</span><strong><Building2 size={16} aria-hidden="true"/>Área de empresa</strong></div></header><nav className="sepe-sede-nav" aria-label="Área de la sede"><div><a href={companyUrl('/servicios/sepe')} onClick={onHome}>Procedimientos y servicios</a><a href={companyUrl('/servicios/sepe?modelos=1')} onClick={e=>onNavigate?.('models',e)}>Información y modelos</a><a href={companyUrl('/servicios/sepe?envio=1')} onClick={e=>onNavigate?.('import',e)}>Registro electrónico</a><a href={companyUrl('/servicios/sepe?consulta=1')} onClick={e=>onNavigate?.('history',e)}>Consultas</a>{onHelp&&<button type="button" onClick={onHelp}>Ayuda</button>}</div></nav></>;
}
