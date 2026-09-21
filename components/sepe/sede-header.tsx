'use client';
import {companyUrl,clientCompany} from '@/lib/company-client';
import {ShieldCheck} from 'lucide-react';
import type {MouseEventHandler} from 'react';

export function SepeIdentity(){
 return <div className="sepe-identity"><img src="./sepe/sepe-logo.png" width="1280" height="520" alt="Servicio Público de Empleo Estatal · SEPE"/></div>;
}
export function SimulationNotice(){
 return <div className="sepe-training-strip"><ShieldCheck size={16} aria-hidden="true"/><strong>SIMULACIÓN EDUCATIVA</strong><span>Sin validez administrativa</span></div>;
}
export default function SedeHeader({onHome}:{onHome?:MouseEventHandler<HTMLAnchorElement>}){
 return <><div className="sepe-central-bar"><a href={companyUrl("/")}>Volver a la central</a><span>{clientCompany().name}</span></div><SimulationNotice/><header className="sepe-sede-header"><a href={companyUrl("/servicios/sepe")} onClick={onHome} aria-label="Inicio de la sede del SEPE"><SepeIdentity/></a><div className="sepe-sede-title">Sede electrónica<span>Servicio Público de Empleo Estatal</span></div></header><nav className="sepe-sede-nav" aria-label="Área de la sede"><div><strong>Empresas</strong><span aria-hidden="true">/</span><a href={companyUrl('/servicios/sepe')} onClick={onHome}>Contratos</a></div></nav></>;
}
