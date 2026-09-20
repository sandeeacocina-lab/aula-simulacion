export type RegistryKind='company'|'person'|'employment';
export type RegistryData=Record<string,string>;
export type RegistryRecord={id:string;kind:RegistryKind;reference:string;title:string;number:string;effectiveDate:string;createdAt:string;data:RegistryData};
export type RegistryPreview={record:RegistryRecord;fingerprint:string};
export const registryNames:Record<RegistryKind,string>={company:'Inscripción de empresa',person:'Afiliación y número de Seguridad Social',employment:'Alta de trabajador'};
export const registryModels:Record<RegistryKind,string>={company:'TA.6',person:'TA.1',employment:'TA.2/S'};
export const registryPaths:Record<RegistryKind,string>={company:'empresas',person:'afiliacion',employment:'altas'};
export const registryReceiptUrl=(id:string)=>'/servicios/seguridad-social/justificante?'+new URLSearchParams({registro:id});
export const socialRoot='/servicios/seguridad-social';
