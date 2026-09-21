'use client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {IncomingSignature} from './incoming-signature';
import {signatureColors,type MailSignature} from '@/lib/mail-signature';

export function SignatureEditor({value,senderName,senderAddress,onChange}:{value:MailSignature|null;senderName:string;senderAddress:string;onChange:(value:MailSignature|null)=>void}){
 const change=(key:keyof MailSignature,v:string)=>{if(value)onChange({...value,[key]:v});};
 return <section className="mail-incoming-signature-editor" aria-label="Firma corporativa del remitente">
  <div className="mail-signature-editor-heading"><h3>Firma corporativa</h3><Button type="button" variant="outline" onClick={()=>onChange(value?null:{name:'',role:'',organization:senderName,email:senderAddress,phone:'',website:'',location:'',color:signatureColors[0]})}>{value?'Quitar firma':'Añadir firma'}</Button></div>
  {value&&<><div className="mail-signature-fields">
   {([['name','Nombre y apellidos',100],['role','Cargo o departamento',120],['organization','Empresa o entidad',120],['email','Correo de la firma',120],['phone','Teléfono',50],['location','Ubicación',120],['website','Web',240]] as const).map(([key,label,max])=><label className="mail-field" key={key}><span>{label}</span><Input value={value[key]} maxLength={max} type={key==='email'?'email':key==='website'?'url':'text'} placeholder={key==='website'?'https://…':undefined} onChange={e=>change(key,e.target.value)}/></label>)}
   <label className="mail-field"><span>Color de la firma</span><select value={value.color} onChange={e=>change('color',e.target.value)}>{signatureColors.map((color,i)=><option key={color} value={color}>{['Turquesa','Fucsia ARREA','Azul','Rojo','Grafito','Oliva DECASARRE','Turquesa del aula'][i]}</option>)}</select></label>
  </div><p className="mail-signature-preview-label">Vista previa</p><IncomingSignature signature={value}/></>}
 </section>;
}
