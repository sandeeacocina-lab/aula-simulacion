// GitHub Pages projects share their origin. Never read or clear another app's keys.
// The original namespace remains exclusively owned by the legacy workspace.
export const STORAGE_PREFIX='aula-simulacion:v1:';
export const WORKSPACES_PREFIX='aula-simulacion:workspaces:v1:';
export const WORKSPACE_SESSION_KEY=WORKSPACES_PREFIX+'selected';
let fallbackSelection:string|undefined;
let operationWorkspace:string|undefined;
export function validWorkspaceId(id:unknown):id is string{return typeof id==='string'&&/^(arrea|decasarre|legacy|custom-[a-zA-Z0-9-]{1,80})$/.test(id);}
export function selectedWorkspaceId():string{
 try{if(!globalThis.sessionStorage)return fallbackSelection||'legacy';const id=globalThis.sessionStorage.getItem(WORKSPACE_SESSION_KEY);return validWorkspaceId(id)?id:'legacy';}
 catch{return fallbackSelection||'legacy';}
}
export function hasWorkspaceSelection(){try{return globalThis.sessionStorage?validWorkspaceId(globalThis.sessionStorage.getItem(WORKSPACE_SESSION_KEY)):!!fallbackSelection;}catch{return false;}}
export function setSelectedWorkspaceId(id:string){
 if(!validWorkspaceId(id))throw Error('La empresa seleccionada no es válida.');
 try{if(globalThis.sessionStorage)globalThis.sessionStorage.setItem(WORKSPACE_SESSION_KEY,id);else fallbackSelection=id;}
 catch{throw Error('No se puede seleccionar la empresa. Permite el almacenamiento de sesión en este navegador.');}
}
export function storageWorkspaceId(){return operationWorkspace||selectedWorkspaceId();}
// Runtime serializes these contexts. Capturing the workspace before queueing is
// essential: selection may change while a file is read or an API task awaits.
export async function withWorkspace<T>(id:string,task:()=>Promise<T>){
 const previous=operationWorkspace;operationWorkspace=id;
 try{return await task();}finally{operationWorkspace=previous;}
}
export function workspaceStorage(id=storageWorkspaceId()){
 if(!validWorkspaceId(id))throw Error('La empresa seleccionada no es válida.');
 const prefix=id==='legacy'?STORAGE_PREFIX:`aula-simulacion:workspace:v1:${id}:`;
 return {
  getItem:(key:string)=>globalThis.localStorage.getItem(prefix+key),
  setItem:(key:string,value:string)=>globalThis.localStorage.setItem(prefix+key,value),
  removeItem:(key:string)=>globalThis.localStorage.removeItem(prefix+key),
  keys:()=>Object.keys(globalThis.localStorage).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length)),
 };
}
export const practiceStorage={
 getItem:(key:string)=>workspaceStorage().getItem(key),
 setItem:(key:string,value:string)=>workspaceStorage().setItem(key,value),
 removeItem:(key:string)=>workspaceStorage().removeItem(key),
 keys:()=>workspaceStorage().keys(),
};
export function storageSnapshot(id=storageWorkspaceId()){const storage=workspaceStorage(id);return Object.fromEntries(storage.keys().map(k=>[k,storage.getItem(k)!]));}
export function clearTaxStorage(){const storage=workspaceStorage();for(const key of storage.keys())if(key.startsWith('aula-'))storage.removeItem(key);}
