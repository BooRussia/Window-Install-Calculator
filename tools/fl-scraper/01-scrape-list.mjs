// Florida Building Code product approval scraper — Phase A
// Working strategy:
//   1) GET pr_app_lst.aspx → form ViewState
//   2) POST pr_app_srch.aspx with lstCategory + lnkSearch → page 1
//   3) Subsequent pages: POST pr_app_lst.aspx with ONLY hidden + pager fields
//      (the result page form action is pr_app_lst.aspx, not pr_app_srch.aspx)

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const BASE = 'https://www.floridabuilding.org/pr';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUT = '/tmp/fl_scraper';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function newSession() {
  const cookies = new Map();
  const readCookies = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const m = line.match(/^([^=]+)=([^;]*)/);
      if (m) cookies.set(m[1], m[2]);
    }
  };
  const cookieHeader = () => [...cookies.entries()].map(([k,v]) => `${k}=${v}`).join('; ');
  return {
    async get(url) {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookieHeader() }});
      readCookies(r);
      return await r.text();
    },
    async post(url, body, referer) {
      const r = await fetch(url, {
        method: 'POST', redirect: 'follow',
        headers: {
          'User-Agent': UA, 'Cookie': cookieHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': referer ?? (BASE + '/pr_app_lst.aspx'),
          'Origin': 'https://www.floridabuilding.org',
        },
        body: new URLSearchParams(body).toString(),
      });
      readCookies(r);
      return await r.text();
    },
  };
}

function extractHidden(html) {
  const h = {};
  for (const m of html.matchAll(/<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/g))
    h[m[1]] = m[2];
  return h;
}

function stripTags(s) { return (s || '').replace(/<[^>]+>/g, ''); }

function parseRows(html, defaultCategory) {
  const m = html.match(/<table[^>]*id=["']grdReport["'][^>]*>([\s\S]*?)<\/table>/);
  if (!m) return [];
  const rows = [...m[1].matchAll(/<tr[^>]*class=["'](?:OddRow|EvenRow)["'][^>]*>([\s\S]*?)<\/tr>/g)];
  const out = [];
  for (const r of rows) {
    const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => t[1]);
    if (tds.length < 5) continue;
    const flText = tds[0];
    const fl = flText.match(/>(FL\d+(?:-R\d+)?)</)?.[1];
    const detailParam = flText.match(/pr_app_dtl\.aspx\?param=([^'"]+)/)?.[1];
    const historyParam = flText.match(/pr_app_hist\.aspx\?param=([^'"]+)/)?.[1];
    const appType = stripTags(tds[1]).trim();
    const col3 = tds[2];
    const mfrMatch = col3.match(/^([\s\S]*?)(?=<br|<span|<B>)/);
    const mfr = stripTags(mfrMatch?.[1] || '').trim();
    const subCat = col3.match(/<B>Subcategory:<\/B>\s*([^<]+)/)?.[1]?.trim() || '';
    const cat = col3.match(/<B>Category:<\/B>\s*([^<]+)/)?.[1]?.trim() || defaultCategory;
    const valText = stripTags(tds[3]).replace(/\s+/g,' ').trim();
    const phone = tds[3].match(/\(\d{3}\)\s*\d{3}-\d{4}/)?.[0] || '';
    const validator = valText.replace(phone, '').trim();
    const status = stripTags(tds[4]).replace(/\s+/g,' ').trim();
    if (!fl) continue;
    out.push({
      fl, appType, manufacturer: mfr, category: cat, subcategory: subCat,
      validator, validatorPhone: phone, status,
      detailParam: detailParam ? decodeURIComponent(detailParam) : null,
      historyParam: historyParam ? decodeURIComponent(historyParam) : null,
    });
  }
  return out;
}

function pageInfo(html) {
  return {
    current: parseInt(html.match(/id=["']pagBottomPager_lblCurrentPage["'][^>]*>(\d+)/)?.[1] ?? '0', 10),
    total: parseInt(html.match(/id=["']pagBottomPager_lblTotalPages["'][^>]*>(\d+)/)?.[1] ?? '0', 10),
  };
}

async function scrapeCategory(catCode, label, opts = {}) {
  const delayMs = opts.delayMs ?? 1200;
  const maxPages = opts.maxPages ?? Infinity;
  const sess = newSession();
  const t0 = Date.now();
  console.log(`\n══ ${label} (${catCode}) ══`);

  // Initial search
  const form = await sess.get(BASE + '/pr_app_lst.aspx');
  let hidden = extractHidden(form);
  let html = await sess.post(BASE + '/pr_app_srch.aspx', {
    ...hidden, __LASTFOCUS: '',
    'lstCodeVersion:drpCustomDropdown': '2023','txtAppNum:txtTextbox': '','lstAppType:drpCustomDropdown': '-2','lstManufacturer:drpCustomDropdown': '-2','lstCategory:drpCustomDropdown': catCode,'lstSubcategory:drpCustomDropdown': '-2','lstAppStatus:drpCustomDropdown': '-2','lstCompMethod:drpCustomDropdown': '-2','lstCertEvalTest:drpCustomDropdown': '-2','txtCertEvalTest:txtTextbox': '','txtDescCertEvalTest:txtTextbox': '','txtEngArch:txtTextbox': '','lstQualAssurEnt:drpCustomDropdown': '-2','txtQualAssurEnt:txtTextbox': '','txtDescQualAssurEnt:txtTextbox': '','lstValEnt:drpCustomDropdown': '-2','txtValEnt:txtTextbox': '','txtDescValEnt:txtTextbox': '','txtModel:txtTextbox': '','txtModelDes:txtTextbox': '','lstHVHZ:drpCustomDropdown': '-2','lstNonHVHZ:drpCustomDropdown': '-2','lstImpact:drpCustomDropdown': '-2','txtDesignPress1:txtTextbox': '','txtDesignPress2:txtTextbox': '','txtOther:txtTextbox': '','rbGenOutPut': '1',
    __EVENTTARGET: 'lnkSearch', __EVENTARGUMENT: '',
  });

  let { current, total } = pageInfo(html);
  const cap = Math.min(total || 1, maxPages);
  const all = [];
  let p1 = parseRows(html, label);
  all.push(...p1);
  console.log(`  page 1/${cap}: ${p1.length} rows`);

  for (let page = 2; page <= cap; page++) {
    await new Promise(r => setTimeout(r, delayMs));
    hidden = extractHidden(html);
    let attempt = 0, success = false;
    while (attempt < 3 && !success) {
      attempt++;
      try {
        html = await sess.post(BASE + '/pr_app_lst.aspx', {
          __EVENTTARGET: '', __EVENTARGUMENT: '',
          __VIEWSTATE: hidden.__VIEWSTATE,
          __VIEWSTATEGENERATOR: hidden.__VIEWSTATEGENERATOR,
          __EVENTVALIDATION: hidden.__EVENTVALIDATION,
          'pagBottomPager:txtGoToPage': String(page),
          'pagBottomPager:btnPageJump.x': '1',
          'pagBottomPager:btnPageJump.y': '1',
        }, BASE + '/pr_app_lst.aspx');
        const info = pageInfo(html);
        if (info.current === page) {
          success = true;
          const rows = parseRows(html, label);
          all.push(...rows);
          if (page % 10 === 0 || page === cap) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
            console.log(`  page ${page}/${cap}: ${rows.length} rows | total so far: ${all.length} | elapsed: ${elapsed}s`);
          }
        } else {
          console.log(`  page ${page}: drift (got ${info.current}), retry ${attempt}`);
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        console.log(`  page ${page}: fetch error, retry ${attempt}: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!success) console.log(`  page ${page}: GAVE UP after 3 retries`);
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  ✓ ${label}: ${all.length} rows in ${dur}s`);
  return all;
}

const PROBE = process.argv.includes('--probe');
const maxPages = PROBE ? 3 : Infinity;
const t0 = Date.now();
const windows  = await scrapeCategory('WINDOWS',  'Windows',        { maxPages });
const extdoors = await scrapeCategory('EXTDOORS', 'Exterior Doors', { maxPages });

const output = {
  scrapedAt: new Date().toISOString(),
  source: 'https://www.floridabuilding.org/pr/pr_app_lst.aspx',
  codeVersion: '2023',
  probeMode: PROBE,
  counts: { windows: windows.length, exteriorDoors: extdoors.length, total: windows.length + extdoors.length },
  records: [...windows, ...extdoors],
};

const file = PROBE ? `${OUT}/fl_index_probe.json` : `${OUT}/fl_index.json`;
writeFileSync(file, JSON.stringify(output, null, 2));
console.log(`\n✅ Wrote ${file}`);
console.log(`   total records: ${output.counts.total}  (windows=${output.counts.windows}, extdoors=${output.counts.exteriorDoors})`);
console.log(`   wall time: ${((Date.now() - t0) / 1000).toFixed(0)}s`);
