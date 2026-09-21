import {getProfile} from './local/profile';
import {localRequest} from './local/dispatch';
import {getWorkspaceId} from './local/workspaces';
export const clientCompany=getProfile;
export function companyUrl(value:string){
 const empresa=getWorkspaceId();
 if(value.startsWith('/api/'))return '#/descargar?'+new URLSearchParams({url:value,empresa});
 if(value.startsWith('/')&&!value.startsWith('//')){
  const [path,search='']=value.split('?'),params=new URLSearchParams(search);params.set('empresa',empresa);
  return '#'+(path==='/'?'/servicios':path)+'?'+params;
 }
 return value;
}
export async function companyFetch(url:string,init?:RequestInit){return localRequest(url,init);}
export const companyStorageKey=(key:string)=>key;
export const shouldRefresh=()=>false;
