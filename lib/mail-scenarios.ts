import {scenarios} from './mail-types';

export type MailScenario={name:string;senderName:string;senderAddress:string;subject:string;body:string};

// Each company has complete templates, including matching subject and invoice
// references. Do not inherit event-specific fields into the trading company.
const decasarreScenarios:readonly MailScenario[]=[
 {name:'Solicitud de presupuesto',senderName:'Nortea Distribución',senderAddress:'compras@nortea.test',subject:'Presupuesto de vinos y quesos',body:'Buenos días, equipo de DECASARRE:\n\nNos gustaría recibir vuestro catálogo y las condiciones de venta para un pedido de vinos y quesos. ¿Podríais indicarnos precios, cantidades mínimas, plazos de entrega y formas de pago?\n\nGracias.\nDepartamento de Compras\nNortea Distribución'},
 {name:'Reclamación de una factura',senderName:'Bodegas del Valle',senderAddress:'administracion@bodegasvalle.test',subject:'Factura BV-026 pendiente de pago',body:'Buenos días, equipo de DECASARRE:\n\nAl revisar nuestra contabilidad, figura pendiente de pago la factura BV-026, por importe de 726,00 €, correspondiente al suministro de mercancía. ¿Podéis comprobarla e indicarnos la fecha prevista de pago? Si ya se ha abonado, os agradeceríamos el justificante.\n\nUn saludo,\nAdministración\nBodegas del Valle'},
 {name:'Consulta sobre un pedido',senderName:'Alimentación La Encina',senderAddress:'compras@laencina.test',subject:'Disponibilidad y entrega de nuestro próximo pedido',body:'Buenos días, equipo de DECASARRE:\n\nEstamos preparando nuestro próximo pedido de vinos y quesos. Necesitamos confirmar la disponibilidad, los gastos de transporte y la fecha de entrega antes de enviaros el pedido definitivo.\n\n¿Podríais facilitarnos también las condiciones de conservación de los quesos durante el transporte?\n\nGracias.\nDepartamento de Compras\nAlimentación La Encina'},
];

export function mailScenarios(company:string):readonly MailScenario[]{
 return company==='decasarre'?decasarreScenarios:company==='arrea'?scenarios:genericScenarios;
}

const genericScenarios:readonly MailScenario[]=[
 {name:'Solicitud de presupuesto',senderName:'Cliente de prácticas',senderAddress:'compras@cliente.test',subject:'Solicitud de presupuesto',body:'Buenos días:\n\nNos gustaría recibir información sobre vuestros productos y servicios, precios, plazos y condiciones comerciales.\n\nGracias.\nDepartamento de Compras'},
 {name:'Consulta de una factura',senderName:'Proveedor de prácticas',senderAddress:'administracion@proveedor.test',subject:'Consulta de factura pendiente',body:'Buenos días:\n\n¿Podríais confirmar la recepción de nuestra factura e indicarnos la fecha prevista de pago?\n\nUn saludo,\nAdministración'},
];
