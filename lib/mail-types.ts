import type {MailAttachment} from './mail-files';
import {getProfile} from './local/profile';
export const MAILBOX=getProfile().mailbox;
// getRandomValues also works in the internal HTTP preview; UUIDs remain random v4.
export function newMailId(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
export const FOLDERS=['inbox','sent','drafts','archive','trash'] as const;
export type Folder=typeof FOLDERS[number];
export const folderNames:Record<Folder,string>={inbox:'Bandeja de entrada',sent:'Enviados',drafts:'Borradores',archive:'Archivo',trash:'Papelera'};
export type MailMessage={id:string;companyId:string;senderName:string;senderAddress:string;recipient:string;subject:string;body:string;source:'web'|'simulation'|'mail';folder:Folder;homeFolder:'inbox'|'sent'|'drafts';isRead:number;revision:number;replyTo:string|null;createdAt:string;updatedAt:string;attachments:MailAttachment[]};
export type MailSummary=Omit<MailMessage,'body'>&{preview:string};
export type MailList={messages:MailSummary[];total:number;counts:Record<Folder,number>;unread:number;page:number;pageSize:number};
export type MailEditor={id:string;revision?:number;senderName:string;senderAddress:string;recipient:string;subject:string;body:string;replyTo?:string|null};
export const scenarios=[
 {name:'Solicitud de presupuesto',senderName:'Nortea Consultores',senderAddress:'eventos@nortea.test',subject:'Presupuesto para una jornada de empresa',body:'Buenos días:\n\nEstamos preparando una jornada para 60 personas y nos gustaría recibir una propuesta de vuestra empresa. Necesitamos información sobre vuestros productos y servicios. La fecha y el lugar están pendientes de confirmar.\n\n¿Podríais indicarnos qué información necesitáis y enviarnos un presupuesto desglosado?\n\nGracias.\nDepartamento de Comunicación\nNortea Consultores'},
 {name:'Reclamación de una factura',senderName:'Lumen Audiovisuales',senderAddress:'administracion@lumen.test',subject:'Factura AV-026 pendiente de pago',body:'Buenos días:\n\nAl revisar nuestra contabilidad, figura pendiente la factura AV-026, por importe de 726,00 €, correspondiente a nuestro último suministro.\n\n¿Podéis comprobarlo e indicarnos la fecha prevista de pago? Si ya se ha abonado, os agradeceríamos el justificante.\n\nUn saludo,\nAdministración\nLumen Audiovisuales'},
 {name:'Consulta de un cliente',senderName:'Vértice Formación',senderAddress:'coordinacion@vertice.test',subject:'Información sobre vuestros servicios',body:'Hola:\n\nEstamos valorando organizar un encuentro con nuestras empresas colaboradoras. ¿Podríais enviarnos vuestro catálogo y las condiciones comerciales?\n\nNos gustaría conocer vuestros servicios y concertar una primera reunión.\n\nQuedamos pendientes de vuestra respuesta.\nVértice Formación'},
] as const;
