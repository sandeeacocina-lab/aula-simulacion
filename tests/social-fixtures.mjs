// Entirely synthetic PDFs. No supplied company or worker identifiers are copied.
export function socialPdf(kind,{ccc='00000000000',company='Empresa de prácticas, S.L.',count='2',badTotal=false,missingCcc=false,period='03/2026-03/2026',missingNaf=false,badDate=false,changedBase=false,missingAmount=false}={}){
 const landscape=kind==='RNT',width=landscape?841.9:595.3,height=landscape?595.3:841.9,items=[];
 const t=(x,y,text)=>items.push({x,y,text:String(text)});
 t(14.16,73.375,landscape?'RELACIÓN NOMINAL DE TRABAJADORES':'LIQUIDACIÓN DE COTIZACIONES');
 const left=landscape?148.2:139.44,mid=landscape?424.19:300.95,right=landscape?554.99:422.87;
 for(const [i,label,value,rlabel,rvalue]of [[0,'Razón social',company,'Código de empresario',''],[1,'Código Cuenta Cotización',missingCcc?'':ccc,'Número de liquidación',''],[2,'Periodo de liquidación',period,'Número de trabajadores',count],[3,'Calificador de liquidación','L00 - NORMAL','Liquidación','TOTAL'],[4,'Fecha de control','','Entidad AT/EP','I.N.S.S']]){const y=120.72+i*17.64;t(17.88,y,label);t(left,y,value);t(mid,y,rlabel);t(right,y,rvalue);}
 if(landscape){
  for(const [x,text]of [[47,'NAF'],[123,'I.P.F.'],[183,'C.A.F.'],[240,'Desde'],[302,'Hasta'],[355,'Días'],[395,'Horas'],[432,'Compl.'],[584,'Descripción'],[768,'Importe']])t(x,294.71,text);
  const rows=[['000000000001','00000000T','FICAA','01/03/2026','08/03/2026',8,'Base de Contingencias Comunes','368,32'],['','','','01/03/2026','08/03/2026',8,'Base de Contingencias Profesionales','368,32'],['','','','09/03/2026','13/03/2026',5,'Base de Contingencias Comunes','184,16'],['','','','09/03/2026','13/03/2026',5,'Base IT de AT y EP de situaciones especiales','184,16'],['','','','14/03/2026','31/03/2026',18,'Base de Contingencias Comunes','828,72'],['','','','14/03/2026','31/03/2026',18,'Base de Contingencias Profesionales','828,72'],['000000000002','00000001R','FICBB','01/03/2026','31/03/2026',30,'Base de Contingencias Comunes','1.461,22'],['','','','01/03/2026','31/03/2026',30,'Base de Contingencias Profesionales','1.461,22']];
  rows.forEach((r,i)=>{if(i===0&&missingNaf)r[0]='';if(i===0&&badDate)r[4]='30/02/2026';if(i===0&&missingAmount)r[7]='';[24.24,110.99,180.84,229.91,290.87,360.35,475.31,780.22].forEach((x,j)=>t(x,313.55+i*17.6,r[j]));});
  t(186,454.31,'Suma de bases');t(569,454.31,'Suma de compensaciones');
  [['Base de Contingencias Comunes',badTotal?'2.000,00':'2.842,42'],['Base de Contingencias Profesionales','2.658,26'],['Base IT de AT y EP de situaciones especiales','184,16']].forEach(([text,n],i)=>{t(17.88,471.95+i*17.64,text);t(384.83,471.95+i*17.64,n);});
 }else{
  t(191.27,273.24,'Descripción');t(445.55,273.24,'Base');t(520.9,273.24,'Importe');const base=changedBase?'2.942,42':'2.842,42';
  [['Contingencias comunes',base,'804,41'],['Equidad intergeneracional MEI',base,'25,58'],['Líquido cotizaciones generales','','829,99'],['IT Accidentes de trabajo',base,'22,74'],['IMS Accidentes de trabajo',base,'19,90'],['Líquido accidentes de trabajo y enfermedades profesionales','','42,64'],['Otras cotizaciones',base,'244,23'],['Líquido otras cotizaciones','','244,23'],['Líquido de totales','',badTotal?'1.000,00':'1.116,86']].forEach(([text,b,n],i)=>{t(17.88,290.76+i*17.61,text);if(b)t(453.1,290.76+i*17.61,b);t(533.62,290.76+i*17.61,n);});
 }
 const literal=s=>s.replace(/[\\()]/g,'\\$&');
 const content=items.filter(i=>i.text).map(i=>`BT /F1 9.72 Tf 1 0 0 1 ${i.x} ${height-i.y} Tm (${literal(i.text)}) Tj ET`).join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',`<< /Length ${Buffer.byteLength(content,'latin1')} >>\nstream\n${content}\nendstream`];
 let source='%PDF-1.4\n',offsets=[0];objects.forEach((s,i)=>{offsets.push(Buffer.byteLength(source,'latin1'));source+=`${i+1} 0 obj\n${s}\nendobj\n`;});const xref=Buffer.byteLength(source,'latin1');source+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(source,'latin1');
}
