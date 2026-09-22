import {dateLabel,money} from '@/lib/bank-types';
import type {BankBreakdown} from '@/lib/bank-receipt-details';

const percent=(value:number)=>value.toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
export function ReceiptBreakdown({data:d}:{data:BankBreakdown}){
 const rows:[string,number,boolean?][]=d.type==='fee'
  ?[[d.vatMode==='taxable'?'Base imponible de la comisión':'Comisión exenta de IVA',d.base],['IVA'+(d.vatMode==='taxable'?' ('+percent(d.vatRate)+')':' · Exenta'),d.vat],['Total cargado en cuenta',d.total,true]]
  :d.type==='interest'
  ?[['Intereses brutos',d.gross],['Retención a cuenta ('+percent(d.withholdingRate)+')',-d.withholding],['Intereses netos abonados',d.net,true]]
  :[['Capital amortizado',d.principal],['Intereses de la cuota',d.interest],...(d.kind==='leasing'?([['Base imponible',d.principal+d.interest],['IVA ('+percent(d.vatRate)+')',d.vat]] as [string,number][]):[]),['Total de la cuota cargado',d.total,true]];
 return <section className="bank-receipt-breakdown">
  <h2>{d.type==='fee'?'Liquidación de comisión':d.type==='interest'?'Liquidación de intereses':'Desglose de la cuota'}</h2>
  {d.type==='installment'&&<dl className="bank-breakdown-meta">
   <div><dt>Financiación</dt><dd>{d.title}</dd></div><div><dt>Contrato</dt><dd>{d.productId}</dd></div>
   <div><dt>Formalización</dt><dd>{dateLabel(d.contractDate)}</dd></div><div><dt>Capital inicial</dt><dd>{money(d.originalPrincipal)}</dd></div>
   <div><dt>Cuota / vencimiento</dt><dd>{d.option?'Opción de compra':d.number+' de '+d.months} · {dateLabel(d.dueDate)}</dd></div><div><dt>Tipo de interés nominal anual</dt><dd>{percent(d.tin)} · Cuotas mensuales</dd></div>
  </dl>}
  {d.type==='interest'&&d.periodFrom&&<p className="bank-breakdown-note">Periodo liquidado: {dateLabel(d.periodFrom)} al {dateLabel(d.periodTo)}.</p>}
  <dl className="bank-breakdown-amounts">{rows.map(([label,amount,total])=><div key={label} className={total?'bank-breakdown-total':undefined}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
  {d.type==='installment'&&<><dl className="bank-breakdown-capital"><div><dt>Capital pendiente antes de esta cuota</dt><dd>{money(d.balanceBefore)}</dd></div><div><dt>Capital pendiente después de esta cuota</dt><dd>{money(d.balanceAfter)}</dd></div></dl>{d.kind==='loan'&&<p className="bank-breakdown-note">Intereses exentos de IVA. Cálculo mensual según el cuadro de amortización contratado.</p>}</>}
 </section>;
}
