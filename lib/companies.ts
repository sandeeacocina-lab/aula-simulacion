import {getProfile} from './local/profile';
export type CompanyId='demo';
export type CompanyProfile=ReturnType<typeof getProfile>;
export const companies={get demo(){return getProfile();}};
export function validCompany(id:unknown):id is CompanyId{return id==='demo';}
