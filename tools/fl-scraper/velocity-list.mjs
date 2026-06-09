// Targeted list scrape: all product approvals for one manufacturer code.
// Usage: node velocity-list.mjs <mfrCode>   (default 12929 = Velocity Impact Products)
import { writeFileSync } from 'node:fs';
const BASE='https://www.floridabuilding.org/pr';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MFR=process.argv[2]||'12929';

function session(){const c=new Map();const rd=r=>{for(const l of r.headers.getSetCookie?.()??[]){const m=l.match(/^([^=]+)=([^;]*)/);if(m)c.set(m[1],m[2]);}};const ch=()=>[...c.entries()].map(([k,v])=>`${k}=${v}`).join('; ');return{async get(u){const r=await fetch(u,{headers:{'User-Agent':UA,'Cookie':ch()}});rd(r);return r.text();},async post(u,b,ref){const r=await fetch(u,{method:'POST',redirect:'follow',headers:{'User-Agent':UA,'Cookie':ch(),'Content-Type':'application/x-www-form-urlencoded','Referer':ref??BASE+'/pr_app_lst.aspx','Origin':'https://www.floridabuilding.org'},body:new URLSearchParams(b).toString()});rd(r);return r.text();}};}
function hidden(h){const o={};for(const m of h.matchAll(/<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/g))o[m[1]]=m[2];return o;}
const strip=s=>(s||'').replace(/<[^>]+>/g,'');
function parseRows(html){
  const m=html.match(/<table[^>]*id=["']grdReport["'][^>]*>([\s\S]*?)<\/table>/);
  if(!m)return[];
  const rows=[...m[1].matchAll(/<tr[^>]*class=["'](?:OddRow|EvenRow)["'][^>]*>([\s\S]*?)<\/tr>/g)];
  const out=[];
  for(const r of rows){
    const tds=[...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t=>t[1]);
    if(tds.length<5)continue;
    const flText=tds[0];
    const flFull=flText.match(/>(FL\d+(?:-R\d+)?)</)?.[1];
    const detailParam=flText.match(/pr_app_dtl\.aspx\?param=([^'"]+)/)?.[1];
    const appType=strip(tds[1]).trim();
    const col3=tds[2];
    const mfr=strip(col3.match(/^([\s\S]*?)(?=<br|<span|<B>)/)?.[1]||'').trim();
    const sub=col3.match(/<B>Subcategory:<\/B>\s*([^<]+)/)?.[1]?.trim()||'';
    const cat=col3.match(/<B>Category:<\/B>\s*([^<]+)/)?.[1]?.trim()||'';
    const valText=strip(tds[3]).replace(/\s+/g,' ').trim();
    const phone=tds[3].match(/\(\d{3}\)\s*\d{3}-\d{4}/)?.[0]||'';
    const validator=valText.replace(phone,'').trim();
    const status=strip(tds[4]).replace(/\s+/g,' ').trim();
    if(!flFull)continue;
    out.push({flFull,appType,mfr,cat,sub,validator,status,detailParam:detailParam?decodeURIComponent(detailParam):null});
  }
  return out;
}
const pInfo=h=>({current:+(h.match(/id=["']pagBottomPager_lblCurrentPage["'][^>]*>(\d+)/)?.[1]??0),total:+(h.match(/id=["']pagBottomPager_lblTotalPages["'][^>]*>(\d+)/)?.[1]??0)});

const s=session();
const form=await s.get(BASE+'/pr_app_lst.aspx');
let h=hidden(form);
let html=await s.post(BASE+'/pr_app_srch.aspx',{...h,__LASTFOCUS:'','lstCodeVersion:drpCustomDropdown':'2023','txtAppNum:txtTextbox':'','lstAppType:drpCustomDropdown':'-2','lstManufacturer:drpCustomDropdown':MFR,'lstCategory:drpCustomDropdown':'-2','lstSubcategory:drpCustomDropdown':'-2','lstAppStatus:drpCustomDropdown':'-2','lstCompMethod:drpCustomDropdown':'-2','lstCertEvalTest:drpCustomDropdown':'-2','txtCertEvalTest:txtTextbox':'','txtDescCertEvalTest:txtTextbox':'','txtEngArch:txtTextbox':'','lstQualAssurEnt:drpCustomDropdown':'-2','txtQualAssurEnt:txtTextbox':'','txtDescQualAssurEnt:txtTextbox':'','lstValEnt:drpCustomDropdown':'-2','txtValEnt:txtTextbox':'','txtDescValEnt:txtTextbox':'','txtModel:txtTextbox':'','txtModelDes:txtTextbox':'','lstHVHZ:drpCustomDropdown':'-2','lstNonHVHZ:drpCustomDropdown':'-2','lstImpact:drpCustomDropdown':'-2','txtDesignPress1:txtTextbox':'','txtDesignPress2:txtTextbox':'','txtOther:txtTextbox':'','rbGenOutPut':'1',__EVENTTARGET:'lnkSearch',__EVENTARGUMENT:''});
let {current,total}=pInfo(html);
const all=[...parseRows(html)];
console.log(`mfr=${MFR} page 1/${total||1}: ${all.length} rows`);
for(let p=2;p<=(total||1);p++){
  await new Promise(r=>setTimeout(r,1000));
  h=hidden(html);
  html=await s.post(BASE+'/pr_app_lst.aspx',{__EVENTTARGET:'',__EVENTARGUMENT:'',__VIEWSTATE:h.__VIEWSTATE,__VIEWSTATEGENERATOR:h.__VIEWSTATEGENERATOR,__EVENTVALIDATION:h.__EVENTVALIDATION,'pagBottomPager:txtGoToPage':String(p),'pagBottomPager:btnPageJump.x':'1','pagBottomPager:btnPageJump.y':'1'},BASE+'/pr_app_lst.aspx');
  const rows=parseRows(html);all.push(...rows);
  console.log(`  page ${p}/${total}: ${rows.length} rows (total ${all.length})`);
}
writeFileSync('/tmp/velocity_list.json',JSON.stringify(all,null,2));
console.log(`\nTOTAL Velocity rows: ${all.length}`);
console.log('Categories:',[...new Set(all.map(r=>r.cat))]);
console.log('Subcategories:',[...new Set(all.map(r=>r.sub))]);
console.log('FL#s:',all.map(r=>r.flFull).join(', '));
