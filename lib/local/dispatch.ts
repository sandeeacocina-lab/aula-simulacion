import {runLocal} from './runtime';
export async function localRequest(url:string,init?:RequestInit):Promise<Response>{
 if(!url.startsWith('/api/')||url.startsWith('//'))return Response.json({error:'Operación no disponible.'},{status:404});
 try{return await runLocal(async()=>{
  const request=new Request(new URL(url,'https://aula-simulacion.invalid'),init),path=new URL(request.url).pathname,write=request.method==='POST';
  if(!['GET','POST'].includes(request.method))return Response.json({error:'Método no disponible.'},{status:405});
  switch(path){
   case '/api/banco':{const m=await import('../bank-server');return write?m.writeBank(request):m.readBank(request);}
   case '/api/banco/operaciones':{const m=await import('../bank-operations-server');return write?m.writeBankOperations(request):m.readBankOperations(request);}
   case '/api/sepe':{const m=await import('../sepe-server');return write?m.writeSepe(request):m.readSepe(request);}
   case '/api/seguridad-social':{const m=await import('../social-server');return write?m.writeSocial(request):m.readSocial(request);}
   case '/api/seguridad-social/registro':{const m=await import('../social-registry-server');return write?m.writeRegistry(request):m.readRegistry(request);}
   case '/api/correo':{const m=await import('../mail-server');return write?m.writeMail(request):m.listMail(request);}
   case '/api/correo/adjuntos':return (await import('../mail-server')).downloadMailAttachment(request);
   case '/api/correo/exportar':return (await import('../mail-server')).exportMail(request);
   case '/api/documentacion':{const m=await import('../documentation-server');return write?m.writeDocumentation(request):m.readDocumentation(request);}
   case '/api/practicas':return (await import('../practice-server')).managePractice(request);
   default:return Response.json({error:'Este servicio no existe en el aula.'},{status:404});
  }
 });}catch(e){console.error('Local practice',e);return Response.json({error:e instanceof DOMException&&e.name==='QuotaExceededError'?'No queda espacio en este navegador. Exporta la práctica y borra registros o adjuntos que ya no necesites.':e instanceof Error?e.message:'No se ha podido guardar la práctica.'},{status:503});}
}
