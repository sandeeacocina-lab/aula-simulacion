// Keep PNG pixels and color information unchanged; remove embedded authoring metadata.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const removable=new Set(['tEXt','zTXt','iTXt','eXIf','tIME','caBX']);
function chunks(buffer){
 if(!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Not a PNG');
 const result=[];
 for(let offset=8;offset<buffer.length;){
  const length=buffer.readUInt32BE(offset),end=offset+12+length;
  if(end>buffer.length)throw Error('Invalid PNG chunk');
  const type=buffer.toString('ascii',offset+4,offset+8);
  result.push({type,bytes:buffer.subarray(offset,end)});offset=end;
 }
 return result;
}
for(const path of ['public/arrea-logo.png','public/decasarre-logo.png']){
 const source=readFileSync(path),parts=chunks(source),kept=parts.filter(part=>!removable.has(part.type));
 const clean=Buffer.concat([source.subarray(0,8),...kept.map(part=>part.bytes)]);
 const pixels=value=>createHash('sha256').update(Buffer.concat(chunks(value).filter(part=>['IHDR','PLTE','IDAT','tRNS'].includes(part.type)).map(part=>part.bytes))).digest('hex');
 if(pixels(source)!==pixels(clean))throw Error('Image content changed');
 writeFileSync(path,clean);
 console.log(path+': metadata removed, pixel data unchanged');
}
