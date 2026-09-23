import {bankDb as db,bankAccount,bankBatch,bankBatchInsert,bankPayload,bankBoundary,bankJson,bankUuid} from './bank-server';
import {companyId,companyProfile} from './company-server';
import {BankError} from './bank-xml';
import {validateImportRows,importKey,type ImportPreview,type ImportReviewRow} from './bank-import';
import type {BankBatch} from './bank-types';
import {storageWorkspaceId} from './local/storage';
import {newMailId} from './mail-types';
import {sha256} from '@noble/hashes/sha2.js';
// Browsers expose neither subtle nor randomUUID on HTTP. Fingerprints remain
// standard SHA-256 and do not depend on the availability of WebCrypto.
const fingerprintHash=(value:string)=>Array.from(sha256(new TextEncoder().encode(value)),byte=>byte.toString(16).padStart(2,'0')).join('');
export function importBank(request:Request){return bankBoundary(async()=>{
 const p=await bankPayload(request);if(!['preview','execute'].includes(String(p.action)))throw new BankError('Operación no válida.');
 let rows;try{rows=validateImportRows(p.rows);}catch(e){throw new BankError((e as Error).message);}
 const a=await bankAccount();if(!a)throw new BankError('Abre primero la cuenta de prácticas.',409);
 const filename=String(p.filename??'movimientos.xlsx').replace(/[\\/\r\n"]/g,'_').slice(0,180),allowDuplicates=p.allowDuplicates===true;
 const fingerprint=fingerprintHash(JSON.stringify({workspace:storageWorkspaceId(),rows,allowDuplicates})),id=p.action==='execute'?bankUuid(p.id):undefined;
 // A confirmed new import may intentionally contain duplicate rows. Scope its
 // ledger key to the submission ID while keeping retries of that ID idempotent.
 const ledgerFingerprint=id?fingerprintHash(JSON.stringify({id,fingerprint})):'';
 if(id){const committed=await bankBatch(id);if(committed){if(committed.kind==='spreadsheet'&&committed.fingerprint===ledgerFingerprint)return bankJson({id,count:committed.count,after:committed.after});throw new BankError('Esta referencia de importación ya se ha utilizado.',409);}}
 const existing=await db().prepare('SELECT booking_date AS date,concept,name,reference,iban,delta FROM bank_movements WHERE company_id=? ORDER BY id').bind(companyId()).all<any>();
 const keys=new Set(existing.results.map(importKey)),seen=new Set<string>();
 const review:ImportReviewRow[]=rows.map(r=>{const key=importKey(r),reason=keys.has(key)?'Coincide con un movimiento de la cuenta':seen.has(key)?'Repetido dentro del archivo':'';seen.add(key);return {...r,duplicate:!!reason,duplicateReason:reason,included:!reason||allowDuplicates};});
 const selected=review.filter(r=>r.included).sort((x,y)=>x.date.localeCompare(y.date)||x.row-y.row),credits=selected.reduce((n,r)=>n+Math.max(r.delta,0),0),debits=selected.reduce((n,r)=>n+Math.max(-r.delta,0),0);
 let after=a.balance,minimum=after,maximum=after;const inserted=selected.map((r,line)=>{after+=r.delta;minimum=Math.min(minimum,after);maximum=Math.max(maximum,after);return {...r,line:line+1,balance:after,amount:Math.abs(r.delta),kind:r.delta>0?'receipt':'payment'};});
 const errors:string[]=[],warnings:string[]=[];if(existing.results.length+selected.length>10000)errors.push('La cuenta superaría el límite de 10.000 movimientos.');if(minimum<0)errors.push('Saldo insuficiente en algún punto del lote. Revisa los importes o ingresa fondos.');if(maximum>1e12)errors.push('Se supera el saldo máximo de la simulación.');if(!selected.length)errors.push('No hay movimientos nuevos que importar.');if(review.some(r=>r.duplicate))warnings.push(allowDuplicates?'Se incluirán también las coincidencias detectadas. Comprueba que son operaciones distintas.':'Se omiten las coincidencias detectadas para evitar duplicados.');
 const preview:ImportPreview={rows:review,errors,warnings,fingerprint,revision:a.revision,before:a.balance,after,credits,debits,count:selected.length,skipped:rows.length-selected.length,minimum};
 if(p.action==='preview')return bankJson(preview);
 if(p.consent!==true||p.fingerprint!==fingerprint||p.revision!==a.revision)throw new BankError('Los datos o el saldo han cambiado. Revisa de nuevo la importación.',409);if(errors.length)throw new BankError(errors.join(' '),409);
 const now=new Date().toISOString(),guard=newMailId(),delta=credits-debits;
 const b:BankBatch={id:id!,kind:'spreadsheet',filename,messageId:id!,format:'Excel',count:selected.length,total:credits+debits,delta,before:a.balance,after,bookingDate:selected[0].date,createdAt:now,warnings,hasXml:false};
 try{await db().batch([
  db().prepare('INSERT INTO practice_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM bank_accounts WHERE id=? AND revision=? AND balance=?) AND (SELECT COUNT(*) FROM bank_movements WHERE company_id=?)=? THEN 1 ELSE 0 END').bind(guard,companyId(),a.revision,a.balance,companyId(),existing.results.length),
  bankBatchInsert(b,ledgerFingerprint,'excel:'+id,'',a.revision),
  db().prepare('UPDATE bank_accounts SET balance=?,revision=revision+1 WHERE id=? AND revision=?').bind(after,companyId(),a.revision),
  db().prepare(`INSERT INTO bank_movements(company_id,batch_id,line,name,iban,amount,delta,balance,concept,reference,kind,requested_date,booking_date,created_at,mandate_id,mandate_date,source_name,source_iban) SELECT ?,?,json_extract(value,'$.line'),json_extract(value,'$.name'),json_extract(value,'$.iban'),json_extract(value,'$.amount'),json_extract(value,'$.delta'),json_extract(value,'$.balance'),json_extract(value,'$.concept'),json_extract(value,'$.reference'),json_extract(value,'$.kind'),json_extract(value,'$.date'),json_extract(value,'$.date'),?,'','',?,? FROM json_each(?)`).bind(companyId(),id,now,companyProfile().name,a.iban,JSON.stringify(inserted)),
  db().prepare('DELETE FROM practice_guards WHERE id=?').bind(guard)
 ]);}catch(e){const committed=await bankBatch(id!);if(committed?.kind==='spreadsheet'&&committed.fingerprint===ledgerFingerprint)return bankJson({id,count:committed.count,after:committed.after});if(String(e).includes('UNIQUE')||String(e).includes('practice_guard_valid'))throw new BankError('La importación o el saldo han cambiado. Actualiza la vista previa.',409);throw e;}
 return bankJson({id,count:selected.length,after},201);
});}
