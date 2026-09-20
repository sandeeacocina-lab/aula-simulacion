'use client';
import {companyUrl} from '@/lib/company-client';


import {Download,ExternalLink,FileText} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';

// Link to the official catalogue so that the SEPE controls the current PDF versions.
const modelsUrl='https://www.sepe.es/HomeSepe/empresas/Contratos-de-trabajo/modelos-contrato.html';

export default function ContractModels(){
 return <>
  <div className="sepe-section-heading"><h2>Modelos de contratos</h2></div>
  <p className="sepe-models-intro">Consulte los modelos publicados por el SEPE y descargue el impreso que necesita para cumplimentar el contrato.</p>
  <div className="sepe-models-resource">
   <FileText size={32} aria-hidden="true"/>
   <div>
    <h3>Modelos oficiales del SEPE</h3>
    <p>Contratos indefinidos, temporales y formativos, anexos y prórrogas.</p>
    <Dialog>
     <DialogTrigger asChild><Button type="button"><Download size={17} aria-hidden="true"/>Consultar y descargar modelos<ExternalLink size={15} aria-hidden="true"/></Button></DialogTrigger>
     <DialogContent className="sepe-help-dialog sepe-external-dialog">
      <DialogTitle>Salida de la aula de simulación</DialogTitle>
      <DialogDescription>Va a abrir la web oficial del SEPE en una nueva pestaña. La aula de simulación permanecerá abierta.</DialogDescription>
      <p className="sepe-external-destination">www.sepe.es · Modelos de contratos</p>
      <div className="sepe-actions">
       <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
       <DialogClose asChild><Button asChild><a href={companyUrl(modelsUrl)} target="_blank" rel="noopener noreferrer">Ir al SEPE<ExternalLink size={16} aria-hidden="true"/></a></Button></DialogClose>
      </div>
     </DialogContent>
    </Dialog>
    <small>Catálogo y descargas en www.sepe.es</small>
   </div>
  </div>
  <section className="sepe-models-practice" aria-labelledby="sepe-models-practice-title">
   <h3 id="sepe-models-practice-title">Cumplimentación manual</h3>
   <ol>
    <li>Seleccione la modalidad de contrato y descargue su modelo en PDF.</li>
    <li>Imprima el documento y rellénelo a mano con los datos de la práctica. También puede utilizar un editor de PDF.</li>
    <li>Revise los datos de empresa, trabajador, jornada y cláusulas, y conserve el contrato cumplimentado.</li>
   </ol>
  </section>
 </>;
}
