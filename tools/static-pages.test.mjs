// Regression test for the generated SEO pages (tools/build-static-pages.mjs).
//
// Re-runs the generator into a fresh temp dir and diffs it byte-for-byte
// against the committed output — except sitemap.xml's <lastmod> dates, which
// are EXPECTED to differ (they always reflect "today", by design) so those
// are normalized before comparing. This is what catches drift: if
// anchor-learn.json, PLANS/TRIAL, or legalDocs()/LEGAL_P change in
// index.html but nobody re-ran the generator and committed the result, this
// test fails.
//
// Also runs a handful of independent structural SEO sanity checks directly
// against the committed files: every sitemap URL resolves to a real file,
// every page has exactly one <h1>, a canonical link, a unique <title>, no
// leftover "REVIEW WITH COUNSEL" placeholder text, and /pricing/ prices
// match PLANS in index.html.
//
// Run:  node tools/static-pages.test.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const GEN = join(here, "build-static-pages.mjs");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

// Same brace/quote/template-literal aware slicer as build-static-pages.mjs,
// duplicated here so this test extracts PLANS independently rather than
// trusting the generator's own extraction.
function sliceBalanced(text, openIndex) {
  const stack = [text[openIndex]];
  let i = openIndex + 1;
  while (i < text.length && stack.length) {
    const c = text[i];
    const top = stack[stack.length - 1];
    if (top === "`" || top === '"' || top === "'") {
      if (c === "\\") { i += 2; continue; }
      if (top === "`" && c === "$" && text[i + 1] === "{") { stack.push("{"); i += 2; continue; }
      if (c === top) { stack.pop(); i++; continue; }
      i++; continue;
    }
    if (c === "`" || c === '"' || c === "'" || c === "{" || c === "[" || c === "(") { stack.push(c); i++; continue; }
    if (c === "}" || c === "]" || c === ")") { stack.pop(); i++; continue; }
    i++;
  }
  return i;
}
function extractLiteral(html, marker) {
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error(`Could not find "${marker}" in index.html`);
  const openIdx = idx + marker.length;
  return html.slice(openIdx, sliceBalanced(html, openIdx));
}

// ----------------------------------------------------------------------------
// Regenerate into a temp dir and collect every file it wrote.
// ----------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "anchor-seo-"));
execFileSync(process.execPath, [GEN, "--out", tmp], { cwd: ROOT, stdio: "pipe" });

function listFiles(dir, base = dir) {
  let out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(listFiles(full, base));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}
const generated = listFiles(tmp).sort();

check("generator wrote the expected set of files", () => {
  assert.ok(generated.includes("learn/index.html"));
  assert.ok(generated.includes("pricing/index.html"));
  assert.ok(generated.includes("legal/terms/index.html"));
  assert.ok(generated.includes("legal/privacy/index.html"));
  assert.ok(generated.includes("legal/disclaimers/index.html"));
  assert.ok(generated.includes("legal/cookies/index.html"));
  assert.ok(generated.includes("robots.txt"));
  assert.ok(generated.includes("sitemap.xml"));
  assert.ok(generated.some(f => f.startsWith("learn/") && f !== "learn/index.html"), "expected at least one learn topic page");
});

// Strip the daily-changing <lastmod> values so this diff is stable across days.
function normalizeSitemap(xml) {
  return xml.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, "<lastmod>DATE</lastmod>");
}

check("committed output matches a fresh regeneration (no drift)", () => {
  for (const f of generated) {
    let committed;
    try { committed = readFileSync(join(ROOT, f), "utf8"); }
    catch { throw new Error(`committed file missing: ${f} — run \`node tools/build-static-pages.mjs\` and commit its output`); }
    const fresh = readFileSync(join(tmp, f), "utf8");
    if (f === "sitemap.xml") {
      assert.equal(normalizeSitemap(committed), normalizeSitemap(fresh), `${f} differs (structurally) from a fresh regeneration`);
    } else {
      assert.equal(committed, fresh, `${f} differs from a fresh regeneration — run \`node tools/build-static-pages.mjs\` and commit its output`);
    }
  }
});

rmSync(tmp, { recursive: true, force: true });

// ----------------------------------------------------------------------------
// Structural SEO checks against the COMMITTED files (what actually ships).
// ----------------------------------------------------------------------------
const pageFiles = generated.filter(f => f.endsWith(".html"));
const pages = pageFiles.map(f => ({ file: f, html: readFileSync(join(ROOT, f), "utf8") }));

check("every sitemap URL has a matching committed file", () => {
  const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length > 0, "sitemap has no <loc> entries");
  for (const loc of locs) {
    const path = loc.replace(/^https:\/\/anchorquoting\.com/, "");
    if (path === "/") { assert.ok(true); continue; } // the app shell itself, not generated by this script
    const file = path.replace(/^\//, "") + "index.html";
    assert.doesNotThrow(() => statSync(join(ROOT, file)), `sitemap URL ${loc} has no matching file (${file})`);
  }
});

check("every generated page has exactly one <h1>", () => {
  for (const p of pages) {
    const n = (p.html.match(/<h1[\s>]/g) || []).length;
    assert.equal(n, 1, `${p.file} has ${n} <h1> elements`);
  }
});

check("every generated page has a canonical link", () => {
  for (const p of pages) {
    assert.match(p.html, /<link rel="canonical" href="https:\/\/anchorquoting\.com\/[^"]*" \/>/, `${p.file} missing canonical link`);
  }
});

check("every generated page has a unique <title>", () => {
  const titles = pages.map(p => (p.html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  titles.forEach((t, i) => assert.ok(t, `${pages[i].file} missing <title>`));
  assert.equal(new Set(titles).size, titles.length, "duplicate <title> across generated pages");
});

check('no leftover "REVIEW WITH COUNSEL" placeholder text', () => {
  for (const p of pages) {
    assert.ok(!/REVIEW WITH COUNSEL/i.test(p.html), `${p.file} still has REVIEW WITH COUNSEL placeholder text`);
  }
});

check("/pricing/ prices match PLANS in index.html", () => {
  const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
  const plansLiteral = extractLiteral(indexHtml, "const PLANS = ");
  const PLANS = new Function(`"use strict"; return (${plansLiteral});`)();
  assert.ok(Array.isArray(PLANS) && PLANS.length > 0, "PLANS did not evaluate to a non-empty array");
  const pricingHtml = readFileSync(join(ROOT, "pricing", "index.html"), "utf8");
  for (const plan of PLANS) {
    assert.ok(pricingHtml.includes(`$${plan.monthlyPrice.toLocaleString("en-US")}<`), `/pricing/ missing monthly price for ${plan.name} ($${plan.monthlyPrice})`);
    assert.ok(pricingHtml.includes(`$${plan.annualPrice.toLocaleString("en-US")}/year`), `/pricing/ missing annual price for ${plan.name} ($${plan.annualPrice})`);
    assert.ok(pricingHtml.includes(esc(plan.name)), `/pricing/ missing plan name ${plan.name}`);
  }
});
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

console.log(`\n${passed} check group(s) passed.`);
