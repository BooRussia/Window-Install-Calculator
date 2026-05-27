// Convert fl_details.json into a compact, app-ready format.
//
// Source schema is verbose (3,435 records × dozens of fields × multiple PDF
// docTypes = 14 MB). The app only needs:
//   - FL number + revision (for matching what's on the sticker)
//   - manufacturer, category, subcategory
//   - product variants (model, DP, impact, HVHZ flags) — this is what
//     contractors filter on
//   - the installation PDF URL (the gold; rest of the PDFs are nice-to-have)
//   - the detail page URL (fallback for "see everything")
//
// Output should be < 2 MB so it lazy-loads instantly on the FL Lookup panel.

import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync('/tmp/fl_scraper/fl_details.json', 'utf8'));
console.log('Loaded ' + src.records.length + ' records');

const compact = {
  scrapedAt: src.scrapedAt,
  source: src.source,
  codeVersion: src.codeVersion,
  counts: src.counts,
  approvals: src.records.map(r => {
    const flMatch = r.fl?.match(/^FL(\d+)(?:-R(\d+))?$/);
    const flNum = flMatch?.[1] ?? r.fl;
    const rev = flMatch?.[2] ? 'R' + flMatch[2] : null;
    // Find the primary installation PDF — usually the latest one
    const instPdfs = (r.pdfs || []).filter(p => p.docType === 'installation');
    const evalPdfs = (r.pdfs || []).filter(p => p.docType === 'evaluation');
    return {
      fl: flNum,
      rev,
      mfr: r.manufacturer,
      cat: r.category === 'Exterior Doors' ? 'doors' : 'windows',
      sub: r.subcategory || null,
      status: r.detail?.appStatus || r.status,
      validatedAt: r.detail?.dateValidated || null,
      validator: r.validator || null,
      products: (r.variants || []).map(v => ({
        model: v.modelIndex,
        name: v.modelNames,
        method: v.method,
        dp: v.designPressure || null,
        impact: /yes/i.test(v.impactResistant),
        hvhz: /yes/i.test(v.hvhz),
        other: v.other || undefined,
      })),
      // Just the LAST (latest revision) installation PDF for compactness
      installPdf: instPdfs.length ? instPdfs[instPdfs.length - 1].url : null,
      // And the most recent evaluation report (engineer's drawing summary)
      evalPdf: evalPdfs.length ? evalPdfs[evalPdfs.length - 1].url : null,
      // ALL installation PDF URLs for users who want them all
      allInstallPdfs: instPdfs.map(p => p.url),
      detailUrl: r.detailParam
        ? 'https://www.floridabuilding.org/pr/pr_app_dtl.aspx?param=' + encodeURIComponent(r.detailParam)
        : null,
    };
  }),
};

// Drop nulls/empties to shrink JSON
function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean).filter(v => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const cv = clean(v);
      if (cv === null || cv === '' || cv === undefined) continue;
      if (Array.isArray(cv) && cv.length === 0) continue;
      out[k] = cv;
    }
    return out;
  }
  return obj;
}

const cleaned = clean(compact);
const json = JSON.stringify(cleaned);
const pretty = JSON.stringify(cleaned, null, 2);

writeFileSync('/tmp/fl_scraper/fl_index_compact.json', json);
writeFileSync('/tmp/fl_scraper/fl_index_compact.pretty.json', pretty);

console.log('Wrote /tmp/fl_scraper/fl_index_compact.json (' + (json.length/1024/1024).toFixed(2) + ' MB minified, ' + (pretty.length/1024/1024).toFixed(2) + ' MB pretty)');
console.log('Records: ' + cleaned.approvals.length);
console.log('With install PDF: ' + cleaned.approvals.filter(a => a.installPdf).length);
console.log('With variants: ' + cleaned.approvals.filter(a => a.products && a.products.length).length);

// Sample
console.log('\\nSample:');
console.log(JSON.stringify(cleaned.approvals.find(a => a.fl === '57'), null, 2));
