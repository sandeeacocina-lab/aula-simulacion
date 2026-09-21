import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
for(const file of ['public/arrea-logo.png','public/decasarre-logo.png'])it(file+' no incluye metadatos de autoría',()=>{
 const data=readFileSync(file),types:string[]=[];
 for(let position=8;position<data.length;){types.push(data.toString('ascii',position+4,position+8));position+=data.readUInt32BE(position)+12;}
 expect(types).toContain('IDAT');
 expect(types.some(type=>['iTXt','tEXt','zTXt','eXIf','caBX'].includes(type))).toBe(false);
});
