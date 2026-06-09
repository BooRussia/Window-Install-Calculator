// Fetch detail pages for the Velocity list rows and emit compacted records
// matching the canonical fl-index.json schema exactly.
import { readFileSync, writeFileSync } from 'node:fs';
const BASE='https://www.floridabuilding.org/pr';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const list=JSON.parse(readFileSync('/tmp/velocity_list.json','utf8'));

const CAT_MAP={ 'Windows':'windows', 'Exterior Doors':'doors', 'Panel Walls':'windows' };
const lbl=(h,id)=>{const m=h.match(new RegExp(`<span[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</span>`));return m?m[1].replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim():null;};
const strip=s=>(s||'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();

function afterLabel(cell,label){
  const re=new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'<\\/B>\\s*(?:&nbsp;)?\\s*([\\s\\S]*?)(?:<BR|<\\/td|<\\/tr|$)','i');
  const m=cell.match(re);
  return m?m[1].replace(/&nbsp;/g,' ').replace(/<[^>]+>/g,'').trim():'';
}
function parseProducts(html){
  const m=html.match(/<table[^>]*id=["']grdProdSum["'][^>]*>([\s\S]*?)<\/table>/);
  if(!m)return[];
  const trs=[...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(t=>t[1]);
  const products=[];
  for(let i=0;i<trs.length;i++){
    const cells=[...trs[i].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c=>c[1]);
    const c0=strip(cells[0]||'');
    if(/^\d+\.\d+/.test(c0)){
      const model=c0;
      const method=strip(cells[1]||'');
      const name=strip(cells[2]||'');
      // limits row is the next <tr>
      const limitsCell=trs[i+1]? ([...trs[i+1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][0]?.[1]||'') : '';
      const hvhz=/yes/i.test(afterLabel(limitsCell,'Approved for use in HVHZ:'));
      const impact=/yes/i.test(afterLabel(limitsCell,'Impact Resistant:'));
      const dp=afterLabel(limitsCell,'Design Pressure:')||'';
      let other=afterLabel(limitsCell,'Other:'); if(!other)other='&nbsp;';
      products.push({model,name,method,dp,impact,hvhz,other});
      i++; // consume limits row
    }
  }
  return products;
}
function pdfs(html){
  const links=[...html.matchAll(/href=['"]\.\.\/(upload\/PR_[A-Za-z_]+\/[^'"]+\.pdf)['"]/g)].map(m=>m[1]);
  const seen=new Set(); const uniq=links.filter(p=>seen.has(p)?false:(seen.add(p),true));
  const url=p=>'https://www.floridabuilding.org/'+p;
  const install=uniq.filter(p=>p.startsWith('upload/PR_Instl_Docs/')).map(url);
  const evals=uniq.filter(p=>p.startsWith('upload/PR_Tech_Docs/')).map(url);
  return { allInstallPdfs:install, installPdf:install[install.length-1]||null, evalPdf:evals[0]||null };
}

const out=[];
for(const row of list){
  const url=`${BASE}/pr_app_dtl.aspx?param=${encodeURIComponent(row.detailParam)}`;
  const html=await (await fetch(url,{headers:{'User-Agent':UA}})).text();
  const flNum=row.flFull.match(/FL(\d+)/)[1];
  const revM=row.flFull.match(/-R(\d+)/);
  const p=pdfs(html);
  const rec={
    fl:flNum,
    ...(revM?{rev:'R'+revM[1]}:{}),
    mfr:lbl(html,'lblProdMfg')||row.mfr,
    cat:CAT_MAP[row.cat]||row.cat.toLowerCase(),
    sub:row.sub,
    status:lbl(html,'lblAppStatus')||row.status,
    validatedAt:lbl(html,'lblDtVal')||'',
    validator:row.validator,
    products:parseProducts(html),
    installPdf:p.installPdf,
    evalPdf:p.evalPdf,
    allInstallPdfs:p.allInstallPdfs,
    detailUrl:url,
  };
  out.push(rec);
  await new Promise(r=>setTimeout(r,400));
}
writeFileSync('/tmp/velocity_records.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,1));
console.log('\nBuilt',out.length,'records:',out.map(r=>'FL'+r.fl+(r.rev?'-'+r.rev:'')+' ['+r.cat+'/'+r.sub+'] '+r.products.length+'p').join(' | '));
