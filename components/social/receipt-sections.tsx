import type {ReceiptSection} from '@/lib/social-receipt-data';
export function ReceiptSections({sections}:{sections:ReceiptSection[]}){return <>{sections.map((s,i)=><section className="ss-receipt-section" key={i}><h2>{s.title}</h2><dl>{s.fields.map(([label,value],j)=><div key={j}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>)}</>;}
