// Phase A.2 — visit each detail page, extract structured metadata + ALL PDF URLs
//
// Input:  /tmp/fl_scraper/fl_index.json  (from scrape_full.mjs)
// Output: /tmp/fl_scraper/fl_details.json  (enriches each record with detail fields + pdfs[])
//
// Concurrency: 4 parallel fetches with 250ms politeness delay per slot.
// Detail pages are static HTML (no ASP.NET form complexity), so much simpler than list scrape.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'https://www.floridabuilding.org/pr';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const CONCURRENCY = 4;
const DELAY_MS = 250;

const indexFile = '/tmp/fl_scraper/fl_index.json';
const outFile   = '/tmp/fl_scraper/fl_details.json';

if (!existsSync(indexFile)) {
  console.error('Missing ' + indexFile + ' — run scrape_full.mjs first');
  process.exit(1);
}

const index = JSON.parse(readFileSync(indexFile, 'utf8'));
console.log(`Loaded ${index.records.length} records from ${indexFile}`);

// Extract text from a <span id="lblX">...</span>
function lbl(html, id) {
  const m = html.match(new RegExp(`<span[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</span>`));
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// Pull all PDF URLs grouped by category (PR_Certificate, PR_Instl_Docs, etc.)
function extractPdfs(html) {
  const links = [...html.matchAll(/href=['"]\.\.\/(upload\/PR_[A-Za-z_]+\/[^'"]+\.pdf)['"]/g)];
  const pdfs = [];
  for (const m of links) {
    const path = m[1];
    const segs = path.split('/');
    const folder = segs[1]; // PR_Certificate | PR_Instl_Docs | PR_Tech_Docs | PR_Stds_Equiv | ...
    const filename = segs[segs.length - 1];
    const url = `https://www.floridabuilding.org/${path}`;
    const docType =
      folder === 'PR_Instl_Docs' ? 'installation' :
      folder === 'PR_Tech_Docs'  ? 'evaluation' :
      folder === 'PR_Certificate'? 'certificate' :
      folder === 'PR_Stds_Equiv' ? 'standards_equivalency' :
      folder.toLowerCase();
    pdfs.push({ docType, folder, filename, url });
  }
  // Dedupe by URL
  const seen = new Set();
  return pdfs.filter(p => seen.has(p.url) ? false : (seen.add(p.url), true));
}

// Pull per-row variant data (Design Pressure, HVHZ, Impact) — these repeat for each product variant
function extractVariants(html) {
  // Variants are typically in a table where each variant row has the B-tagged fields
  // Simple pattern: find each block that contains all 4 indicators together
  const variants = [];
  const re = /<B>Approved for use in HVHZ:<\/B>\s*([^<]*?)(?:<[^>]+>\s*)*?<B>Approved for use outside HVHZ:<\/B>\s*([^<]*?)(?:<[^>]+>\s*)*?<B>Impact Resistant:<\/B>\s*([^<]*?)(?:<[^>]+>\s*)*?<B>Design Pressure:<\/B>\s*([^<]*?)(?:<[^>]+>\s*)*?<B>Other:<\/B>\s*([^<]*?)(?:<\/td|<tr|<\/p)/g;
  for (const m of html.matchAll(re)) {
    variants.push({
      hvhz: m[1].trim(),
      outsideHvhz: m[2].trim(),
      impactResistant: m[3].trim(),
      designPressure: m[4].trim(),
      other: m[5].trim(),
    });
  }
  return variants;
}

async function fetchDetail(detailParam) {
  const url = `${BASE}/pr_app_dtl.aspx?param=${encodeURIComponent(detailParam)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

async function processRecord(rec, idx) {
  if (!rec.detailParam) return { ...rec, _error: 'no detailParam' };
  try {
    const html = await fetchDetail(rec.detailParam);
    return {
      ...rec,
      detail: {
        appStatus: lbl(html, 'lblAppStatus'),
        codeVersion: lbl(html, 'lblCodeVersion'),
        codeSection: lbl(html, 'lblCodeSection') || lbl(html, 'lblCdSection'),
        manufacturer: lbl(html, 'lblProdMfg'),
        manufacturerAddress: lbl(html, 'lblProdMfgAddr'),
        techRep: lbl(html, 'lblTechRep'),
        techRepAddress: lbl(html, 'lblTechRepAddr'),
        qualAssurRep: lbl(html, 'lblQualAssurRep'),
        qualAssurRepAddress: lbl(html, 'lblQualAssurRepAddr'),
        validationEntity: lbl(html, 'lblValEnt'),
        certEvalTest: lbl(html, 'lblCertEvalTest'),
        certEvalTestDesc: lbl(html, 'lblCertEvalTestDesc'),
        complianceMethod: lbl(html, 'lblCompMethod'),
        productAppMethod: lbl(html, 'lblProdAppMeth'),
        dateSubmitted: lbl(html, 'lblDtSub'),
        dateApproved: lbl(html, 'lblDtAppr'),
        datePending: lbl(html, 'lblDtPend'),
        dateValidated: lbl(html, 'lblDtVal'),
        referenceStandards: lbl(html, 'lblRefStd'),
        comments: lbl(html, 'lblComments'),
        moreInfo: lbl(html, 'lblMoreInfo'),
        equivStdCertBy: lbl(html, 'lblEquivProdStdCertBy'),
        equivStdFile: lbl(html, 'lblEquivProdStdFile'),
        authSignature: lbl(html, 'lblAuthSign'),
      },
      variants: extractVariants(html),
      pdfs: extractPdfs(html),
    };
  } catch (err) {
    return { ...rec, _error: err.message };
  }
}

const out = [];
let done = 0, errors = 0;
const total = index.records.length;
const t0 = Date.now();

// Worker pool — CONCURRENCY parallel, each respecting DELAY_MS
async function worker(slot) {
  while (true) {
    const idx = done + slot;
    if (idx >= total) return;
    const rec = index.records[idx];
    const enriched = await processRecord(rec, idx);
    out[idx] = enriched;
    if (enriched._error) errors++;
    done++;
    if (done % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const rate = (done / (elapsed || 1)).toFixed(1);
      const remaining = ((total - done) / (rate || 1)).toFixed(0);
      console.log(`  [detail] ${done}/${total} (errors=${errors}) | ${rate}/s | ETA ${remaining}s`);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}
// Actually simpler: just await Promise.all of N parallel workers
// But the loop above has a race (done++ from multiple slots concurrent). Switch to atomic queue.
const queue = index.records.map((rec, idx) => ({ rec, idx }));
let qi = 0;
const lock = { next: () => qi < queue.length ? queue[qi++] : null };
out.length = total;

async function poolWorker() {
  while (true) {
    const item = lock.next();
    if (!item) return;
    const enriched = await processRecord(item.rec, item.idx);
    out[item.idx] = enriched;
    if (enriched._error) errors++;
    done++;
    if (done % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const rate = (done / (elapsed || 1)).toFixed(1);
      console.log(`  [detail] ${done}/${total} (errors=${errors}) | ${rate}/s | elapsed ${elapsed}s`);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

console.log(`Starting detail fetch — ${total} records, concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms`);
await Promise.all(Array.from({length: CONCURRENCY}, () => poolWorker()));

const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n✓ Done — ${done} records, ${errors} errors, ${elapsed}s wall`);

writeFileSync(outFile, JSON.stringify({
  scrapedAt: new Date().toISOString(),
  source: index.source,
  codeVersion: index.codeVersion,
  counts: {
    total: out.length,
    withDetails: out.filter(r => !r._error).length,
    errors,
    pdfsTotal: out.reduce((s, r) => s + (r.pdfs?.length || 0), 0),
    installationPdfs: out.reduce((s, r) => s + (r.pdfs?.filter(p => p.docType === 'installation').length || 0), 0),
  },
  records: out,
}, null, 2));
console.log(`✓ Wrote ${outFile}`);
