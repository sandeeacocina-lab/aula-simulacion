import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {FolderOpen,FileText,Plus,Search,CheckCircle2} from 'lucide-react';
import {AulaHeader,AulaFooter} from '../home';
import {Button} from '../ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {DeleteRecord} from '../practice/delete-record';
import {clientCompany,companyFetch,companyUrl} from '@/lib/company-client';
import {fileSize} from '@/lib/mail-files';
import {checkDocuments,DOCUMENT_ACCEPT,DOCUMENT_CATEGORIES,DOCUMENT_STATUSES,type Assignment,type PracticeDocument,type Documentation,type DocumentCategory,type DocumentStatus} from '@/lib/documentation-types';

async function send(body:FormData|Record<string,unknown>){
 const form=body instanceof FormData;
 const response=await companyFetch('/api/documentacion',{method:'POST',...(form?{}:{headers:{'Content-Type':'application/json'}}),body:form?body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'No se han podido guardar los cambios.');return result as {id:string};
}
function AssignmentEditor({assignment,onSaved,onClose}:{assignment:Assignment|null;onSaved:(id:string)=>Promise<void>;onClose:()=>void}){
 const [title,setTitle]=useState(assignment?.title||''),[period,setPeriod]=useState(assignment?.period||''),[instructions,setInstructions]=useState(assignment?.instructions||''),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(event:FormEvent){event.preventDefault();setError('');const problem=checkDocuments(files,assignment?.total||0);if(problem){setError(problem);return;}setBusy(true);try{
  const form=new FormData();form.set('assignment',JSON.stringify({action:assignment?'edit':'create',id:assignment?.id||crypto.randomUUID(),revision:assignment?.revision,title,period,instructions}));for(const file of files)form.append('files',file,file.name);
  const result=await send(form);await onSaved(result.id);onClose();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="documents-dialog"><DialogTitle>{assignment?'Editar encargo':'Preparar un encargo'}</DialogTitle><DialogDescription>Escribe las instrucciones y añade los documentos de partida. Los nuevos archivos se mezclarán al guardarlos.</DialogDescription><form onSubmit={event=>void save(event)}>
  {error&&<p role="alert" className="aula-error">{error}</p>}
  <label>Título del encargo<input required maxLength={120} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Por ejemplo: Operaciones del primer trimestre" disabled={busy}/></label>
  <label>Periodo o referencia<input maxLength={80} value={period} onChange={event=>setPeriod(event.target.value)} placeholder="Por ejemplo: Enero–marzo 2026" disabled={busy}/></label>
  <label>Instrucciones para el alumnado<textarea rows={5} maxLength={12000} value={instructions} onChange={event=>setInstructions(event.target.value)} disabled={busy}/></label>
  <label className="documents-upload">{assignment?'Añadir documentos':'Documentos del encargo'}<input type="file" multiple accept={DOCUMENT_ACCEPT} disabled={busy} onChange={event=>{setFiles(Array.from(event.target.files||[]));setError('');}}/></label>
  <p className="aula-hint">Hasta 50 documentos por encargo, 8 MB por archivo y 60 MB de archivos en la práctica. PDF, imágenes, documentos, hojas de cálculo y ZIP.</p>
  {files.length>0&&<ul className="documents-pending">{files.map((file,index)=><li key={index}><span>{file.name}</span><small>{fileSize(file.size)}</small></li>)}</ul>}
  {assignment&&<p className="aula-hint">Los {assignment.total} documentos existentes conservan sus clasificaciones y notas.</p>}
  <div className="aula-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy?'Guardando…':assignment?'Guardar encargo':'Crear encargo'}</Button></div>
 </form></DialogContent></Dialog>;
}
function DocumentEditor({document,onSaved,onClose}:{document:PracticeDocument;onSaved:()=>Promise<void>;onClose:()=>void}){
 const [category,setCategory]=useState(document.category),[status,setStatus]=useState(document.status),[notes,setNotes]=useState(document.notes),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await send({action:'classify',id:document.id,revision:document.revision,category,status,notes});await onSaved();onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="documents-dialog"><DialogTitle>Organizar documento</DialogTitle><DialogDescription>{document.name}</DialogDescription><form onSubmit={event=>void save(event)}>
  {error&&<p role="alert" className="aula-error">{error}</p>}
  <label>Clasificación<select value={category} onChange={event=>setCategory(event.target.value as DocumentCategory)} disabled={busy}>{Object.entries(DOCUMENT_CATEGORIES).map(([key,value])=><option value={key} key={key}>{value}</option>)}</select></label>
  <label>Estado<select value={status} onChange={event=>setStatus(event.target.value as DocumentStatus)} disabled={busy}>{Object.entries(DOCUMENT_STATUSES).map(([key,value])=><option value={key} key={key}>{value}</option>)}</select></label>
  <label>Notas de trabajo<textarea rows={5} maxLength={4000} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Anota lo que debes hacer o las gestiones que has realizado." disabled={busy}/></label>
  <p className="aula-hint">Marcar un documento como completado registra tu avance. Los trámites se realizan desde cada servicio.</p>
  <div className="aula-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy?'Guardando…':'Guardar clasificación'}</Button></div>
 </form></DialogContent></Dialog>;
}
export default function DocumentationWorkspace(){
 const company=clientCompany(),[data,setData]=useState<Documentation>({assignments:[],documents:[]}),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[creating,setCreating]=useState(false),[editing,setEditing]=useState<Assignment|null>(null),[document,setDocument]=useState<PracticeDocument|null>(null),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[status,setStatus]=useState('');
 async function load(id?:string){const response=await companyFetch('/api/documentacion'),next=await response.json();if(!response.ok)throw Error(next.error||'No se puede abrir la bandeja.');setData(next);setSelected(previous=>id||((next.assignments as Assignment[]).some(item=>item.id===previous)?previous:next.assignments[0]?.id||''));}
 useEffect(()=>{void load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const assignment=data.assignments.find(item=>item.id===selected);
 const documents=useMemo(()=>data.documents.filter(item=>item.assignment_id===selected),[data.documents,selected]);
 const filtered=documents.filter(item=>(!category||item.category===category)&&(!status||item.status===status)&&(!query||(item.name+' '+item.notes).toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))));
 async function shuffle(){if(!assignment)return;setBusy(true);setError('');try{await send({action:'shuffle',id:assignment.id,revision:assignment.revision});await load();setMessage('Documentos mezclados. Se conservan las clasificaciones y notas.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function saved(id?:string){await load(id);setError('');setMessage('Cambios guardados en esta práctica.');}
 function choose(id:string){setSelected(id);setQuery('');setCategory('');setStatus('');setMessage('');}
 return <div className="aula documents-app"><AulaHeader/><main className="aula-main"><a className="aula-back" href={companyUrl('/')}>Volver a los servicios</a>
  <section className="documents-intro"><div><p className="aula-eyebrow">{company.shortName} · DOCUMENTOS DE TRABAJO</p><h1>Bandeja de documentación</h1><p>Revisa cada encargo, clasifica sus documentos y organiza el trabajo de tu empresa.</p></div><Button onClick={()=>setCreating(true)}><Plus size={18}/>Preparar un encargo</Button></section>
  <div className="documents-sharing"><FolderOpen size={24}/><p><strong>Del encargo a la práctica.</strong> Para repartir un encargo al alumnado, añade sus documentos y descarga la copia de la práctica. Cada persona importa la copia y trabaja en su navegador.</p><Button variant="outline" asChild><a href={companyUrl('/practicas')}>Compartir o importar práctica</a></Button></div>
  {error&&<div className="aula-error" role="alert">{error}<Button variant="outline" onClick={()=>{setLoading(true);void load().then(()=>setError('')).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Actualizar bandeja</Button></div>}
  {message&&<p className="aula-success" role="status"><CheckCircle2 size={18}/>{message}</p>}
  {loading?<p role="status">Abriendo los encargos…</p>:!data.assignments.length?<section className="documents-empty"><FolderOpen size={40}/><h2>Tu primer encargo empieza aquí</h2><p>Prepara las instrucciones y sube las facturas, pedidos, nóminas u otros documentos con los que trabajarás.</p><Button onClick={()=>setCreating(true)}>Crear el primer encargo</Button><p>Si tu docente ya te ha enviado una copia, impórtala desde Mi práctica.</p></section>:<div className="documents-layout">
   <aside className="documents-assignments" aria-label="Encargos disponibles"><h2>Encargos <span>{data.assignments.length}</span></h2>{data.assignments.map(item=><button type="button" key={item.id} aria-pressed={item.id===selected} onClick={()=>choose(item.id)}><strong>{item.title}</strong>{item.period&&<span>{item.period}</span>}<small>{item.completed} de {item.total} completados</small></button>)}</aside>
   {assignment&&<section className="documents-workspace" aria-label={assignment.title}><header className="documents-assignment-heading"><div>{assignment.period&&<p className="aula-eyebrow">{assignment.period}</p>}<h2>{assignment.title}</h2><p>{assignment.completed} de {assignment.total} documentos completados</p></div><Button variant="outline" onClick={()=>setEditing(assignment)}>Editar encargo y añadir archivos</Button></header>
    {assignment.instructions&&<div className="documents-instructions"><h3>Instrucciones del encargo</h3><p>{assignment.instructions}</p></div>}
    <div className="documents-filters"><label><span><Search size={15}/>Buscar documento</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nombre o notas"/></label><label>Clasificación<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">Todas las clasificaciones</option>{Object.entries(DOCUMENT_CATEGORIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Estado<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">Todos los estados</option>{Object.entries(DOCUMENT_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
    <div className="documents-count"><p role="status">{filtered.length} {filtered.length===1?'documento':'documentos'}</p><Button variant="outline" size="sm" disabled={busy||documents.length<2} onClick={()=>void shuffle()}>{busy?'Mezclando…':'Mezclar documentos'}</Button></div>
    {!documents.length?<div className="documents-empty"><FileText size={32}/><h3>Este encargo todavía no tiene documentos</h3><Button onClick={()=>setEditing(assignment)}>Añadir documentos</Button></div>:!filtered.length?<p className="documents-no-results">Ningún documento coincide con los filtros.</p>:<ul className="documents-list">{filtered.map(item=><li key={item.id}><div className="documents-file"><FileText size={24}/><div><h3>{item.name}</h3><p>{fileSize(item.size)} <span aria-hidden="true">·</span> {DOCUMENT_CATEGORIES[item.category]}</p></div><span className={'documents-status '+item.status}>{DOCUMENT_STATUSES[item.status]}</span></div>{item.notes&&<p className="documents-notes">{item.notes}</p>}<div className="documents-actions">
      {['application/pdf','image/png','image/jpeg','image/webp'].includes(item.type)&&<Button variant="outline" size="sm" asChild><a target="_blank" rel="noopener" href={companyUrl('/api/documentacion?file='+item.id+'&preview=1')} aria-label={'Ver '+item.name}>Ver documento</a></Button>}
      <Button variant="outline" size="sm" asChild><a target="_blank" rel="noopener" href={companyUrl('/api/documentacion?file='+item.id)} aria-label={'Descargar '+item.name}>Descargar</a></Button><Button size="sm" onClick={()=>setDocument(item)} aria-label={'Clasificar '+item.name}>Clasificar y anotar</Button><DeleteRecord scope="document" id={item.id} title={item.name} onDeleted={()=>saved()}/>
     </div></li>)}</ul>}
    <div className="documents-delete-assignment"><DeleteRecord scope="documentation" id={assignment.id} title={assignment.title} label="Borrar encargo" description="Se borrarán el encargo, sus archivos, clasificaciones y notas de esta práctica." onDeleted={()=>saved()}/></div>
   </section>}
  </div>}
 </main><AulaFooter/>{(creating||editing)&&<AssignmentEditor assignment={editing} onSaved={saved} onClose={()=>{setCreating(false);setEditing(null);}}/>}{document&&<DocumentEditor document={document} onSaved={()=>saved()} onClose={()=>setDocument(null)}/>}</div>;
}
