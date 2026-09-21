import {getProfile,saveProfile,validateProfile,type Profile} from './profile';
import {hasWorkspaceSelection,selectedWorkspaceId,setSelectedWorkspaceId,validWorkspaceId,workspaceStorage,WORKSPACES_PREFIX} from './storage';

export type Workspace={id:string;profile:Profile;kind:'arrea'|'decasarre'|'custom'|'legacy'};
const CUSTOM_PREFIX=WORKSPACES_PREFIX+'custom:';
const LEGACY_KEY=WORKSPACES_PREFIX+'legacy';
let initialization:Promise<void>|undefined;

function legacySettingsExist(){return workspaceStorage('legacy').keys().some(key=>{
 const value=workspaceStorage('legacy').getItem(key);
 return !!value&&(key==='profile'||key==='mail-signature-name'||key.startsWith('aula-'));
});}
export function listWorkspaces():Workspace[]{
 const ids:Array<{id:string;kind:Workspace['kind']}>=[{id:'arrea',kind:'arrea'},{id:'decasarre',kind:'decasarre'}];
 if(globalThis.localStorage.getItem(LEGACY_KEY)||legacySettingsExist())ids.push({id:'legacy',kind:'legacy'});
 for(const key of Object.keys(globalThis.localStorage).filter(k=>k.startsWith(CUSTOM_PREFIX)).sort()){
  const id=key.slice(CUSTOM_PREFIX.length);if(validWorkspaceId(id)&&id.startsWith('custom-'))ids.push({id,kind:'custom'});
 }
 return ids.map(workspace=>({...workspace,profile:getProfile(workspace.id)}));
}
export function getWorkspaceId(){return selectedWorkspaceId();}
export function selectWorkspace(id:string){
 if(!listWorkspaces().some(workspace=>workspace.id===id))throw Error('La empresa seleccionada no existe en este navegador.');
 setSelectedWorkspaceId(id);
}
export function createWorkspace(value:unknown):{id:string;profile:Profile}{
 const profile=validateProfile(value),id='custom-'+crypto.randomUUID(),storage=workspaceStorage(id);
 try{saveProfile(profile,id);globalThis.localStorage.setItem(CUSTOM_PREFIX+id,'1');}
 catch(error){storage.removeItem('profile');globalThis.localStorage.removeItem(CUSTOM_PREFIX+id);throw error;}
 return {id,profile};
}
export function initializeWorkspaces(preferred?:string|null):Promise<void>{
 const ready=initialization??=initialize().finally(()=>{initialization=undefined;});
 return ready.then(()=>{
  const workspaces=listWorkspaces();
  // A receipt/attachment link may open a new tab without an inherited session.
  // An explicit link target must never fall back to a different company's data.
  if(preferred!==undefined&&preferred!==null){
   if(!workspaces.some(workspace=>workspace.id===preferred))throw Error('La empresa de este enlace no existe en este navegador. Vuelve al inicio y abre una empresa disponible.');
   setSelectedWorkspaceId(preferred);return;
  }
  if(!hasWorkspaceSelection()||!workspaces.some(workspace=>workspace.id===getWorkspaceId()))setSelectedWorkspaceId(workspaces.some(workspace=>workspace.kind==='legacy')?'legacy':'arrea');
 });
}
async function initialize(){
 // Leave the old keyspace and its database untouched; exposing a legacy entry
 // lets an existing learner continue or export the exact previous practice.
 if(legacySettingsExist()||await (await import('./runtime')).hasLegacyPractice())globalThis.localStorage.setItem(LEGACY_KEY,'1');
}
