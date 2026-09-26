import {PDFDocument,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import QRCode from 'qrcode';
import fontkit from '@pdf-lib/fontkit';
import regularFontUrl from './fonts/DejaVuSans.ttf?url';
import boldFontUrl from './fonts/DejaVuSans-Bold.ttf?url';
import {displayDate,fullNumber,lineAmount,money,totals,type Invoice,type InvoiceRecord} from './model';
import {qrUrl} from './store';
export async function logoBytes(logo:string){
 if(!['./arrea-logo-negro.svg','./decasarre-logo.png'].includes(logo))return undefined;
 const response=await fetch(logo);if(!response.ok)throw Error('No se ha podido cargar el logotipo.');const blob=await response.blob();if(logo.endsWith('.png'))return new Uint8Array(await blob.arrayBuffer());
 const url=URL.createObjectURL(blob);try{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('No se ha podido leer el logotipo.'));img.src=url;});const canvas=document.createElement('canvas');canvas.width=600;canvas.height=Math.round(600*img.height/img.width);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se ha podido preparar el logotipo.')),'image/png'));return new Uint8Array(await png.arrayBuffer());}finally{URL.revokeObjectURL(url);}
}
const colour=(hex:string)=>{const h=hex.replace('#','');return rgb(parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255);};
export async function invoicePdf(i:Invoice,record:InvoiceRecord|undefined,options:{baseUrl:string;practiceId?:string;logo?:Uint8Array;annulled?:boolean}){
 const doc=await PDFDocument.create();doc.setTitle(`${i.type==='F1'?'Factura':'Factura rectificativa'} ${fullNumber(i)} · ${i.brand.shortName}`);doc.setAuthor('Autoría y dirección pedagógica: Sandra Mangas');doc.setSubject('Simulación docente de facturación. Sin comunicación con la AEAT.');
 doc.registerFontkit(fontkit);
 const fonts=await Promise.all([regularFontUrl,boldFontUrl].map(async url=>{const response=await fetch(url);if(!response.ok)throw Error('No se ha podido cargar la tipografía de la factura.');return new Uint8Array(await response.arrayBuffer());}));
 const regular=await doc.embedFont(fonts[0],{subset:true}),bold=await doc.embedFont(fonts[1],{subset:true}),muted=colour('#5d6268'),ink=colour('#17191d'),accent=colour(i.brand.shortName==='ARREA'?'#d40057':i.brand.accent),paper=colour('#f2f3f1');
 let page:PDFPage=doc.addPage([595.28,841.89]),y=630;
 const clean=(s:string,font:PDFFont)=>[...String(s)].map(c=>{try{font.encodeText(c);return c;}catch{return c==='\u202f'||c==='\u00a0'?' ':'?';}}).join('');
 const text=(s:string,x:number,at:number,size=9,font=regular,c=ink)=>page.drawText(clean(s,font),{x,y:at,size,font,color:c});
 const right=(s:string,x:number,at:number,size=9,font=regular,c=ink)=>text(s,x-font.widthOfTextAtSize(clean(s,font),size),at,size,font,c);
 const wrap=(s:string,width:number,size=9,font=regular)=>String(s).split('\n').flatMap(paragraph=>{let line='';const result:string[]=[];for(const word of paragraph.split(/\s+/)){if(!word)continue;const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(clean(candidate,font),size)<=width){line=candidate;continue;}if(line)result.push(line);line='';for(const ch of word){if(font.widthOfTextAtSize(clean(line+ch,font),size)>width){result.push(line);line='';}line+=ch;}}if(line||!result.length)result.push(line);return result;});
 const nextPage=()=>{page=doc.addPage([595.28,841.89]);text(i.brand.shortName,38,792,14,bold);right(`${record?'':'BORRADOR · '}${fullNumber(i)}`,557,792,10,bold);page.drawLine({start:{x:38,y:778},end:{x:557,y:778},thickness:2,color:accent});y=752;};
 const ensure=(height:number)=>{if(y-height<68)nextPage();};
 const para=(s:string,x:number,width:number,size=9,c=ink)=>{for(const line of wrap(s,width,size)){ensure(size+6);text(line,x,y,size,regular,c);y-=size+5;}};
 page.drawRectangle({x:0,y:668,width:595.28,height:174,color:colour(i.brand.shortName==='DECASARRE'?'#202217':'#101114')});
 if(record){const url=qrUrl(i,options.baseUrl,options.practiceId),qr=await QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:4,width:500});const png=await doc.embedPng(qr);page.drawImage(png,{x:38,y:715,width:90,height:90});page.drawRectangle({x:38,y:715,width:90,height:90,opacity:0});page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[38,715,128,805],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:requirePdfString(url)}})));text('VERI*FACTU',38,701,8,bold,rgb(1,1,1));text('SIMULACIÓN DOCENTE',38,689,6.4,regular,rgb(1,1,1));}
 else{text('BORRADOR',38,775,13,bold,rgb(1,1,1));text('Pendiente de emisión',38,755,8,regular,rgb(1,1,1));}
 text(i.type==='F1'?'FACTURA':'FACTURA RECTIFICATIVA',150,795,10,bold,rgb(1,1,1));
 for(const [n,line] of wrap(i.number?fullNumber(i):'Número pendiente',265,20,bold).entries())text(line,150,765-n*23,20,bold,rgb(1,1,1));
 text('Fecha de expedición: '+displayDate(i.date),150,716,9,regular,rgb(1,1,1));
 if(options.annulled)text('ANULADA EN LA SIMULACIÓN',150,693,8,bold,rgb(1,1,1));
 else if(record&&record.status!=='Correcto')text(record.status==='Incorrecto'?'REGISTRO RECHAZADO · REVISAR':'REGISTRO ACEPTADO CON ERRORES',150,693,7.4,bold,rgb(1,1,1));
 if(options.logo){const logo=await doc.embedPng(options.logo),size=logo.scaleToFit(110,110);page.drawImage(logo,{x:447+(110-size.width)/2,y:707+(110-size.height)/2,width:size.width,height:size.height});}else for(const [n,line] of wrap(i.brand.shortName,110,13,bold).entries())text(line,442,763-n*18,13,bold,rgb(1,1,1));
 const party=(label:string,p:Invoice['issuer'],x:number)=>{text(label,x,639,8,bold,accent);let at=620;for(const line of wrap(p.name,245,11,bold)){text(line,x,at,11,bold);at-=14;}for(const line of wrap(`NIF ${p.nif}\n${p.address}${p.contact?'\n'+p.contact:''}`,245,9)){text(line,x,at,9,regular,muted);at-=13;}return at;};
 y=Math.min(party('EMISOR',i.issuer,38),party('CLIENTE',i.customer,312))-20;
 if(i.operationDate){text('Fecha de operación: '+displayDate(i.operationDate),38,y,8,regular,muted);y-=20;}
 if(i.type!=='F1'){para('Rectifica: '+i.original,38,519,9);para('Motivo: '+i.reason,38,519,9);y-=10;}
 const head=()=>{ensure(45);page.drawRectangle({x:38,y:y-8,width:519,height:25,color:paper});text('CÓD.',44,y,7,bold);text('CONCEPTO',94,y,7,bold);right('CANT.',342,y,7,bold);right('PRECIO',420,y,7,bold);right('DTO. %',471,y,7,bold);right('IMPORTE',550,y,7,bold);y-=31;};head();
 for(const line of i.lines){const desc=wrap(line.description,195,9),code=wrap(line.code,43,7.5);const h=Math.max(desc.length*13,code.length*11,20)+10;if(y-h<68){nextPage();head();}for(const [n,s] of desc.entries())text(s,94,y-n*13,9);for(const [n,s] of code.entries())text(s,44,y-n*11,7.5,regular,muted);right(new Intl.NumberFormat('es-ES',{maximumFractionDigits:3}).format(line.quantity),342,y,8.5);right(money(line.price),420,y,8.5);right(line.discount?String(line.discount).replace('.',','):'',471,y,8.5);right(money(lineAmount(line)),550,y,8.5,bold);y-=h;page.drawLine({start:{x:38,y:y+8},end:{x:557,y:y+8},thickness:.5,color:paper});}
 y-=14;ensure(160+i.taxes.length*20);
 text('DESGLOSE DE IMPUESTOS',38,y,8,bold,accent);y-=26;for(const [label,x] of [['IMPORTE PREVIO',154],['DESCUENTO',244],['BASE IMPONIBLE',364],['IVA',437],['CUOTA',550]] as const)right(label,x,y,7,bold);y-=22;
 for(const t of i.taxes){right(money(t.gross),154,y);right(money(t.discount),244,y);right(money(roundPdf(t.gross-t.discount)),364,y);right(String(t.rate).replace('.',',')+' %',437,y);right(money(t.quota),550,y);y-=22;}
 const total=totals(i);y-=12;page.drawRectangle({x:330,y:y-40,width:227,height:60,color:accent});text('TOTAL FACTURA',344,y-1,8,bold,rgb(1,1,1));right(money(total.total),543,y-24,19,bold,rgb(1,1,1));text('Base imponible: '+money(total.base),38,y-1,9);text('IVA: '+money(total.vat),38,y-18,9);y-=65;
 ensure(70);text('PAGO',38,y,8,bold,accent);y-=19;para(i.payment+(i.dueDate?' · Vencimiento '+displayDate(i.dueDate):''),38,519,9);if(i.iban)para('IBAN '+i.iban.replace(/(.{4})/g,'$1 ').trim(),38,519,9);y-=12;
 if(i.notes.trim()){ensure(40);text('OBSERVACIONES',38,y,8,bold,accent);y-=18;para(i.notes,38,519,8.5);}

 for(const [index,p] of doc.getPages().entries()){page=p;if(record&&index===doc.getPageCount()-1)text('Registro docente: SIM-'+record.id.slice(0,8).toUpperCase()+' · '+new Date(record.createdAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid'})+(record.payload.signature?' · Firma simulada: '+record.payload.signature.nif:''),38,59,6.5,regular,muted);page.drawLine({start:{x:38,y:49},end:{x:557,y:49},thickness:.5,color:colour('#d9dcdf')});text('Simulación docente. Sin validez fiscal ni comunicación con la AEAT.',38,35,7,regular,muted);text('Autoría y dirección pedagógica: Sandra Mangas.',38,24,6.5,regular,muted);right(`${index+1} / ${doc.getPageCount()}`,557,30,7,regular,muted);}
 return new Uint8Array(await doc.save());
}
import {PDFString} from 'pdf-lib';
const requirePdfString=(s:string)=>PDFString.of(s);
const roundPdf=(v:number)=>Math.round(v*100)/100;
