import{tt as e}from"./index-fi2DVASY.js";e().mailbox;function t(){let e=crypto.getRandomValues(new Uint8Array(16));e[6]=e[6]&15|64,e[8]=e[8]&63|128;let t=Array.from(e,e=>e.toString(16).padStart(2,`0`)).join(``);return t.slice(0,8)+`-`+t.slice(8,12)+`-`+t.slice(12,16)+`-`+t.slice(16,20)+`-`+t.slice(20)}var n=[`inbox`,`sent`,`drafts`,`archive`,`trash`],r={inbox:`Bandeja de entrada`,sent:`Enviados`,drafts:`Borradores`,archive:`Archivo`,trash:`Papelera`},i=[{name:`Solicitud de presupuesto`,senderName:`Nortea Consultores`,senderAddress:`eventos@nortea.test`,subject:`Presupuesto para una jornada de empresa`,body:`Buenos días:

Estamos preparando una jornada para 60 personas y nos gustaría recibir una propuesta de vuestra empresa. Necesitamos información sobre vuestros productos y servicios. La fecha y el lugar están pendientes de confirmar.

¿Podríais indicarnos qué información necesitáis y enviarnos un presupuesto desglosado?

Gracias.
Departamento de Comunicación
Nortea Consultores`},{name:`Reclamación de una factura`,senderName:`Lumen Audiovisuales`,senderAddress:`administracion@lumen.test`,subject:`Factura AV-026 pendiente de pago`,body:`Buenos días:

Al revisar nuestra contabilidad, figura pendiente la factura AV-026, por importe de 726,00 €, correspondiente a nuestro último suministro.

¿Podéis comprobarlo e indicarnos la fecha prevista de pago? Si ya se ha abonado, os agradeceríamos el justificante.

Un saludo,
Administración
Lumen Audiovisuales`},{name:`Consulta de un cliente`,senderName:`Vértice Formación`,senderAddress:`coordinacion@vertice.test`,subject:`Información sobre vuestros servicios`,body:`Hola:

Estamos valorando organizar un encuentro con nuestras empresas colaboradoras. ¿Podríais enviarnos vuestro catálogo y las condiciones comerciales?

Nos gustaría conocer vuestros servicios y concertar una primera reunión.

Quedamos pendientes de vuestra respuesta.
Vértice Formación`}];export{i,r as n,t as r,n as t};