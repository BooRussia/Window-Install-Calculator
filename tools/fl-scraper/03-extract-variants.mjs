import { readFileSync, writeFileSync } from 'node:fs';
const BASE = 'https://www.floridabuilding.org/pr';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const CONCURRENCY = 6;
const DELAY_MS = 200;

const details = JSON.parse(readFileSync('/tmp/fl_scraper/fl_details.json', 'utf8'));
console.log('Loaded ' + details.records.length + ' records');

// Variant rows on detail pages use ANY of: OddRow, EvenRow, TextMediumNormal
function extractModelsAndVariants(html) {
  const re = /<tr[^>]*class=['"](?:OddRow|EvenRow|TextMediumNormal)['"][^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>[\s\S]{0,200}?<B>Limits of Use<\/B>[\s\S]{0,300}?<B>Approved for use in HVHZ:<\/B>\s*&nbsp;?\s*([^<]*)<BR>[\s\S]{0,60}?<B>Approved for use outside HVHZ:<\/B>\s*&nbsp;?\s*([^<]*)<BR>[\s\S]{0,60}?<B>Impact Resistant:<\/B>\s*&nbsp;?\s*([^<]*)<BR>[\s\S]{0,60}?<B>Design Pressure:<\/B>\s*&nbsp;?\s*([^<]*)<BR>[\s\S]{0,60}?<B>Other:<\/B>\s*&nbsp;?\s*([^<]*?)(?:<\/td|<BR>\s*<B>|<BR>\s*<\/)/g;
  const out = [];
  for (const m of html.matchAll(re)) {
    out.push({
      modelIndex: m[1].trim(),
      method: m[2].trim(),
      modelNames: m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      hvhz: m[4].trim(),
      outsideHvhz: m[5].trim(),
      impactResistant: m[6].trim(),
      designPressure: m[7].trim(),
      other: m[8].trim(),
    });
  }
  return out;
}

const t0 = Date.now();
let done = 0, errors = 0, variantsFound = 0;
const queue = details.records.map((r, i) => ({ r, i }));
let qi = 0;
const next = () => qi < queue.length ? queue[qi++] : null;

async function worker() {
  while (true) {
    const item = next();
    if (!item) return;
    const { r } = item;
    if (!r.detailParam) { done++; continue; }
    try {
      const url = BASE + '/pr_app_dtl.aspx?param=' + encodeURIComponent(r.detailParam);
      const res = await fetch(url, { headers: { 'User-Agent': UA }});
      const html = await res.text();
      r.variants = extractModelsAndVariants(html);
      variantsFound += r.variants.length;
      done++;
      if (done % 100 === 0) {
        const elapsed = ((Date.now()-t0)/1000).toFixed(0);
        console.log('  ' + done + '/' + details.records.length + ' | variants ' + variantsFound + ' | ' + (done/elapsed).toFixed(1) + '/s | ' + elapsed + 's');
      }
    } catch (err) {
      errors++; done++;
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));
console.log('Done ' + ((Date.now()-t0)/1000).toFixed(0) + 's | ' + errors + ' errors');

details.counts.variants = details.records.reduce((s,r) => s + (r.variants?.length||0), 0);
details.counts.recordsWithVariants = details.records.filter(r => r.variants?.length > 0).length;
details.counts.hvhzApprovedVariants = details.records.flatMap(r => r.variants||[]).filter(v => /yes/i.test(v.hvhz)).length;
details.counts.impactResistantVariants = details.records.flatMap(r => r.variants||[]).filter(v => /yes/i.test(v.impactResistant)).length;

writeFileSync('/tmp/fl_scraper/fl_details.json', JSON.stringify(details, null, 2));
console.log('Wrote fl_details.json');
console.log('  variants:', details.counts.variants);
console.log('  records with variants:', details.counts.recordsWithVariants);
console.log('  HVHZ-approved variants:', details.counts.hvhzApprovedVariants);
console.log('  impact-resistant variants:', details.counts.impactResistantVariants);
