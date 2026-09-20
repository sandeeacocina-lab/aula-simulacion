'use client';
import {companyUrl,clientCompany} from '@/lib/company-client';
import {ArrowLeft,ShieldCheck} from 'lucide-react';

export function SepeIdentity(){
 return <div className="sepe-identity"><img src="./sepe/sepe-logo.png" width="1280" height="520" alt="Servicio Público de Empleo Estatal · SEPE"/></div>;
}
export function SimulationNotice(){
 return <div className="sepe-training-strip"><ShieldCheck size={16} aria-hidden="true"/><strong>SIMULACIÓN EDUCATIVA</strong><span>Sin validez administrativa</span></div>;
}
export default function SedeHeader(){
 return <><div className="sepe-central-bar"><a href={companyUrl("/")}><ArrowLeft size={14} aria-hidden="true"/>Volver a la central</a><span>{clientCompany().name}</span></div><SimulationNotice/><header className="sepe-sede-header"><a href={companyUrl("/servicios/sepe")} aria-label="Inicio de la sede del SEPE"><SepeIdentity/></a><div className="sepe-sede-title">Sede electrónica<span>Servicio Público de Empleo Estatal</span></div></header><div className="sepe-sede-nav"><div><strong>Empresas</strong><span aria-hidden="true">/</span><span>Comunicación de la contratación</span></div></div></>;
}
