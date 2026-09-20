import {getProfile} from './local/profile';
export const clientCompany=getProfile;
export function companyUrl(value:string){
 if(value.startsWith('/api/'))return '#/descargar?url='+encodeURIComponent(value);
 if(value.startsWith('/')&&!value.startsWith('//'))return '#'+value;
 return value;
}
export async function companyFetch(url:string,init?:RequestInit){const {localRequest}=await import('./local/dispatch');return localRequest(url,init);}
export const companyStorageKey=(key:string)=>key;
export const shouldRefresh=()=>false;
