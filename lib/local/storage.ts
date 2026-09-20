// GitHub Pages projects share their origin. Never read or clear another app's keys.
export const STORAGE_PREFIX='aula-simulacion:v1:';
export const practiceStorage={
 getItem:(key:string)=>globalThis.localStorage.getItem(STORAGE_PREFIX+key),
 setItem:(key:string,value:string)=>globalThis.localStorage.setItem(STORAGE_PREFIX+key,value),
 removeItem:(key:string)=>globalThis.localStorage.removeItem(STORAGE_PREFIX+key),
 keys:()=>Object.keys(globalThis.localStorage).filter(k=>k.startsWith(STORAGE_PREFIX)).map(k=>k.slice(STORAGE_PREFIX.length)),
};
export function storageSnapshot(){return Object.fromEntries(practiceStorage.keys().map(k=>[k,practiceStorage.getItem(k)!]));}
export function clearTaxStorage(){for(const key of practiceStorage.keys())if(key.startsWith('aula-'))practiceStorage.removeItem(key);}
