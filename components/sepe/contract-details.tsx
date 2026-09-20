import {sepeDate,type SepeContract} from '@/lib/sepe-types';
export function ContractFields({contract}:{contract:SepeContract}){
 const groups=[...new Set(contract.fields.map(f=>f.group))];
 return <div className="sepe-field-groups">{groups.map(group=><section key={group}><h4>{group}</h4><dl>{contract.fields.filter(f=>f.group===group).map((f,i)=><div key={f.path+i}><dt>{f.label}</dt><dd>{/FECHA_/.test(f.path)&&/^\d{8}$/.test(f.value)?sepeDate(f.value.slice(0,4)+'-'+f.value.slice(4,6)+'-'+f.value.slice(6)):f.value}</dd></div>)}</dl></section>)}</div>;
}
export function ContractCard({contract:c,print=false}:{contract:SepeContract;print?:boolean}){
 return <article className="sepe-contract"><header><span className="sepe-contract-number">{String(c.line).padStart(2,'0')}</span><div><h3>{c.name}</h3><p>{c.personId}</p></div><span className="sepe-pill">Contrato {c.code}</span></header><dl className="sepe-contract-overview"><div><dt>NIF de empresa</dt><dd>{c.employerId}</dd></div><div><dt>Cuenta de cotización</dt><dd>{c.ccc}</dd></div><div><dt>Inicio del contrato</dt><dd>{sepeDate(c.startDate)}</dd></div><div><dt>Fin comunicado</dt><dd>{c.endDate?sepeDate(c.endDate):'No consta en el fichero'}</dd></div></dl>{print?<ContractFields contract={c}/>:<details><summary>Ver todos los datos del contrato</summary><ContractFields contract={c}/></details>}</article>;
}
