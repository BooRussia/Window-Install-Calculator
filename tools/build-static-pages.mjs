#!/usr/bin/env node
// ============================================================================
// SEO static-page generator for anchorquoting.com
// ----------------------------------------------------------------------------
// Google (and every other crawler) only ever sees one URL today: the app is a
// single index.html with hash routes (#/learn, #/pricing, #/terms, ...). This
// script generates real, crawlable, server-rendered HTML pages for the public
// marketing content — Learn topics, Pricing, and the four legal docs — by
// READING THE APP'S OWN SOURCE OF TRUTH, so the static pages can never drift
// out of sync with what the app actually shows:
//
//   - anchor-learn.json                → /learn/, /learn/<slug>/
//   - `const PLANS` + `const TRIAL`    → /pricing/          (in index.html)
//   - the pricing FAQ <details> blocks → /pricing/ FAQ      (in index.html)
//   - `legalDocs()` + `LEGAL_P`        → /legal/<doc>/      (in index.html)
//
// It also writes robots.txt and sitemap.xml.
//
// This script is idempotent: re-running it regenerates byte-identical output,
// except for sitemap.xml's <lastmod> dates, which always reflect the day the
// script was run (by design — see tools/static-pages.test.mjs, which ignores
// those dates when diffing against the committed output).
//
// Usage:
//   node tools/build-static-pages.mjs            # writes into the repo root
//   node tools/build-static-pages.mjs --out DIR   # writes into DIR instead
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SITE = "https://anchorquoting.com";
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const outArgIdx = process.argv.indexOf("--out");
const OUT = outArgIdx !== -1 && process.argv[outArgIdx + 1]
  ? (process.argv[outArgIdx + 1].startsWith("/") ? process.argv[outArgIdx + 1] : join(ROOT, process.argv[outArgIdx + 1]))
  : ROOT;

const written = [];
function write(relPath, content) {
  const full = join(OUT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  written.push(relPath);
}

// ----------------------------------------------------------------------------
// Tiny brace/quote/template-literal aware slicer. Given `text` and the index
// of an opening `{` / `[` / `(`, returns the index just past its matching
// closer — correctly skipping over string/template contents (including
// `${...}` interpolations) so it never gets confused by punctuation inside
// the legal-doc prose. Used to pull well-defined JS literals/functions out of
// index.html without a full JS parser dependency.
// ----------------------------------------------------------------------------
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
  const end = sliceBalanced(html, openIdx);
  return html.slice(openIdx, end);
}

function extractFunctionSource(html, signature) {
  const idx = html.indexOf(signature);
  if (idx === -1) throw new Error(`Could not find "${signature}" in index.html`);
  const braceIdx = html.indexOf("{", idx);
  const end = sliceBalanced(html, braceIdx);
  return html.slice(idx, end);
}

// ----------------------------------------------------------------------------
// Load source content
// ----------------------------------------------------------------------------
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const learnData = JSON.parse(readFileSync(join(ROOT, "anchor-learn.json"), "utf8"));

// PLANS / TRIAL — plain-object/array literals, safe to eval directly.
const trialLiteral = extractLiteral(html, "const TRIAL = ");
const plansLiteral = extractLiteral(html, "const PLANS = ");
const TRIAL = new Function(`"use strict"; return (${trialLiteral});`)();
const PLANS = new Function(`"use strict"; return (${plansLiteral});`)();

// LEGAL_P + legalDocs() — evaluate the real function so the generated legal
// pages are always byte-identical (minus markup) to what the in-app Legal
// screen renders.
const legalPLiteral = extractLiteral(html, "const LEGAL_P = ");
const legalDocsFnSrc = extractFunctionSource(html, "function legalDocs()");
const LEGAL_P = new Function(`"use strict"; return (${legalPLiteral});`)();
const legalDocs = new Function(`"use strict"; const LEGAL_P = ${legalPLiteral}; ${legalDocsFnSrc}; return legalDocs;`)();
const LEGAL_DOCS = legalDocs();

// Pricing FAQ — the <details class="lp-faq"> blocks near the pricing section.
const faqRe = /<details class="lp-faq">\s*<summary>([\s\S]*?)<svg[\s\S]*?<\/summary>\s*<div class="faq-a">([\s\S]*?)<\/div>\s*<\/details>/g;
const FAQS = [];
let fm;
while ((fm = faqRe.exec(html))) {
  FAQS.push({ q: fm[1].trim(), a: fm[2].trim() });
}
if (!FAQS.length) throw new Error("Could not find any <details class=\"lp-faq\"> blocks in index.html");

// ----------------------------------------------------------------------------
// Shared HTML escaping (mirrors escHtml() in index.html)
// ----------------------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) { return "$" + Number(n).toLocaleString("en-US"); }

// ----------------------------------------------------------------------------
// Shared page shell — brand colors match index.html's :root tokens
// (navy #020617 background, gold #c9a558 accent, Inter/Anton via Google Fonts).
// ----------------------------------------------------------------------------
const SITE_CSS = `
  :root { color-scheme: dark; --navy-0:#020617; --navy-1:#0d1426; --gold:#c9a558; --gold-hi:#dfc07a;
    --ink-1:#f8fafc; --ink-2:#cbd5e1; --ink-3:#94a3b8; --ink-4:#64748b; --hairline:rgba(148,163,184,0.16); }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--navy-0); }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--ink-2); line-height: 1.6;
    -webkit-font-smoothing: antialiased; }
  .anton { font-family: 'Anton', 'Inter', sans-serif; font-weight: 400; letter-spacing: 0.01em; }
  a { color: var(--gold-hi); }
  .wrap { max-width: 960px; margin: 0 auto; padding: 0 24px; }
  header.site-header { position: sticky; top: 0; z-index: 10; background: rgba(2,6,23,0.86); backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--hairline); }
  header.site-header .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; }
  header.site-header .brand { font-family: 'Anton', sans-serif; font-size: 20px; letter-spacing: 0.02em; color: var(--ink-1);
    text-decoration: none; display: flex; align-items: center; gap: 8px; }
  header.site-header .brand::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--gold-hi);
    display: inline-block; }
  header.site-header nav { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
  header.site-header nav a { color: var(--ink-3); text-decoration: none; font-size: 14px; font-weight: 600; }
  header.site-header nav a:hover { color: var(--gold-hi); }
  .btn-gold { display: inline-block; background: var(--gold-hi); color: #1a1305; font-weight: 800; font-size: 14px;
    padding: 10px 18px; border-radius: 10px; text-decoration: none; white-space: nowrap; }
  .btn-gold:hover { background: #ecd28e; }
  main { min-height: 60vh; }
  main .wrap { padding-top: 48px; padding-bottom: 64px; }
  h1 { font-family: 'Anton', sans-serif; font-weight: 400; letter-spacing: 0.01em; color: var(--ink-1);
    font-size: clamp(28px, 5vw, 44px); line-height: 1.1; margin: 0 0 14px; }
  h2 { color: var(--ink-1); font-size: 22px; font-weight: 800; margin: 36px 0 12px; }
  h3 { color: var(--ink-1); font-size: 17px; font-weight: 800; margin: 24px 0 10px; }
  p { margin: 0 0 14px; }
  ul, ol { margin: 0 0 14px; padding-left: 22px; }
  li { margin-bottom: 6px; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 12px; font-weight: 700; color: var(--gold-hi); margin-bottom: 10px; }
  .lede { font-size: 17px; color: var(--ink-2); max-width: 68ch; }
  .card { background: rgba(15,23,42,0.6); border: 1px solid rgba(51,65,85,0.6); border-radius: 16px; padding: 22px; }
  .grid { display: grid; gap: 18px; }
  .breadcrumbs { font-size: 12px; color: var(--ink-4); margin-bottom: 18px; }
  .breadcrumbs a { color: var(--ink-4); text-decoration: none; }
  .breadcrumbs a:hover { color: var(--gold-hi); }
  footer.site-footer { border-top: 1px solid var(--hairline); padding: 40px 24px calc(34px + env(safe-area-inset-bottom)); }
  footer.site-footer nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; font-size: 12px; }
  footer.site-footer nav a { color: var(--ink-4); text-decoration: none; }
  footer.site-footer nav a:hover { color: var(--gold-hi); }
  footer.site-footer p { text-align: center; font-size: 11px; color: var(--ink-4); margin: 16px 0 0; }
`;

function siteHeader() {
  return `<header class="site-header"><div class="bar">
    <a class="brand" href="/">Anchor</a>
    <nav><a href="/">Home</a><a href="/learn/">Learn</a><a href="/pricing/">Pricing</a></nav>
    <a class="btn-gold" href="/">Start free trial</a>
  </div></header>`;
}
function siteFooter() {
  return `<footer class="site-footer"><div class="wrap">
    <nav>
      <a href="/learn/">Learn</a>
      <a href="/pricing/">Pricing</a>
      <a href="/legal/terms/">Terms</a>
      <a href="/legal/privacy/">Privacy</a>
      <a href="/legal/disclaimers/">Disclaimers</a>
      <a href="/legal/cookies/">Cookies</a>
    </nav>
    <p>&copy; 2026 Anchor &mdash; ${esc(LEGAL_P.brand)}, a product of ${esc(LEGAL_P.company)}</p>
  </div></footer>`;
}

function page({ path, title, description, ogType = "website", bodyHtml, jsonLd = [] }) {
  const canonical = `${SITE}${path}`;
  const ld = jsonLd.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="${ogType}" />
<meta property="og:image" content="${SITE}/brand/anchor-mark.png" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:image" content="${SITE}/brand/anchor-mark.png" />
<link rel="icon" type="image/png" href="/brand/anchor-mark.png" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>${SITE_CSS}</style>
${ld}
</head>
<body>
${siteHeader()}
<main>${bodyHtml}</main>
${siteFooter()}
</body>
</html>
`;
}

function breadcrumbs(trail) {
  // trail: [{name, path}] path optional for the last (current) item
  const inner = trail.map((t, i) => i === trail.length - 1
    ? esc(t.name)
    : `<a href="${t.path}">${esc(t.name)}</a>`).join(" &rsaquo; ");
  return `<div class="breadcrumbs">${inner}</div>`;
}
function breadcrumbJsonLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE}${t.path || ""}`
    }))
  };
}

// ============================================================================
// /learn/ index + /learn/<slug>/
// ============================================================================
const allTopics = []; // { section, slug, title, summary }
for (const sec of learnData.sections || []) {
  for (const t of sec.topics || []) allTopics.push({ section: sec, topic: t });
}

function renderKeyNums(keyNumbers) {
  if (!keyNumbers || !keyNumbers.length) return "";
  return `<ul class="learn-keynums">${keyNumbers.map(k => {
    const m = String(k).match(/^([^:]{2,26}):\s+(.{1,60})$/);
    return m ? `<li><strong>${esc(m[1])}:</strong> ${esc(m[2])}</li>` : `<li>${esc(k)}</li>`;
  }).join("")}</ul>`;
}
function renderBody(body) {
  if (!body || !body.length) return "";
  return `<ul>${body.map(b => `<li>${esc(b)}</li>`).join("")}</ul>`;
}
function renderProsCons(pros, cons) {
  if (!(pros && pros.length) && !(cons && cons.length)) return "";
  let out = `<div class="grid" style="grid-template-columns:1fr 1fr;">`;
  out += pros && pros.length ? `<div><h3>Pros</h3><ul>${pros.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "<div></div>";
  out += cons && cons.length ? `<div><h3>Watch-outs</h3><ul>${cons.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "<div></div>";
  out += `</div>`;
  return out;
}

// /learn/index.html — section + topic directory
{
  const secHtml = (learnData.sections || []).map(sec => `
    <section class="card" style="margin-bottom:18px;">
      <h2 style="margin-top:0;">${esc(sec.label)}</h2>
      <p class="lede" style="font-size:15px;">${esc(sec.blurb || "")}</p>
      <ul>${(sec.topics || []).map(t => `<li><a href="/learn/${esc(t.slug)}/">${esc(t.title)}</a></li>`).join("")}</ul>
    </section>`).join("");
  const body = `<div class="wrap">
    ${breadcrumbs([{ name: "Home", path: "/" }, { name: "Learn" }])}
    <div class="eyebrow">Learn</div>
    <h1>${esc(learnData.meta?.title || "Window & Door Basics")}</h1>
    <p class="lede">${esc(learnData.meta?.intro || "")}</p>
    ${secHtml}
  </div>`;
  write("learn/index.html", page({
    path: "/learn/",
    title: "Window & Door Installer Guide | Anchor",
    description: learnData.meta?.intro || "A plain-English guide to how Florida windows and doors are built, installed, and measured.",
    bodyHtml: body,
    jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Learn", path: "/learn/" }])]
  }));
}

// /learn/<slug>/index.html — one page per topic
for (const { section, topic } of allTopics) {
  const fig = topic.diagram && topic.diagram.svg
    ? `<figure style="margin:20px 0;background:rgba(15,23,42,0.5);border:1px solid rgba(51,65,85,0.5);border-radius:14px;padding:16px;">${topic.diagram.svg}${topic.diagram.caption ? `<figcaption style="margin-top:8px;font-size:12px;color:var(--ink-4);">${esc(topic.diagram.caption)}</figcaption>` : ""}</figure>`
    : "";
  const body = `<div class="wrap" style="max-width:760px;">
    ${breadcrumbs([{ name: "Home", path: "/" }, { name: "Learn", path: "/learn/" }, { name: topic.title }])}
    <div class="eyebrow">${esc(section.label)}</div>
    <h1>${esc(topic.title)}</h1>
    <p class="lede">${esc(topic.summary || "")}</p>
    ${fig}
    ${renderKeyNums(topic.keyNumbers)}
    ${renderBody(topic.body)}
    ${renderProsCons(topic.pros, topic.cons)}
    <p style="margin-top:32px;"><a href="/learn/">&larr; Back to all topics</a></p>
  </div>`;
  const description = (topic.summary || "").slice(0, 155);
  write(`learn/${topic.slug}/index.html`, page({
    path: `/learn/${topic.slug}/`,
    title: `${topic.title} | Anchor Learn`,
    description,
    ogType: "article",
    bodyHtml: body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: topic.title,
        description,
        author: { "@type": "Organization", name: LEGAL_P.brand },
        publisher: { "@type": "Organization", name: LEGAL_P.brand },
        mainEntityOfPage: `${SITE}/learn/${topic.slug}/`
      },
      breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Learn", path: "/learn/" }, { name: topic.title, path: `/learn/${topic.slug}/` }])
    ]
  }));
}

// ============================================================================
// /pricing/
// ============================================================================
{
  const planCards = PLANS.map(p => `
    <div class="card"${p.highlighted ? ' style="border-color:var(--gold);"' : ""}>
      ${p.badge ? `<div class="eyebrow">${esc(p.badge)}</div>` : ""}
      <h2 style="margin-top:0;">${esc(p.name)}</h2>
      <p style="color:var(--ink-3);font-size:14px;">${esc(p.tagline)}</p>
      <p style="font-size:32px;font-weight:900;color:var(--ink-1);margin:14px 0 0;">${money(p.monthlyPrice)}<span style="font-size:14px;color:var(--ink-4);font-weight:600;">/mo</span></p>
      <p style="font-size:13px;color:var(--ink-4);margin-top:4px;">or ${money(p.annualPrice)}/year</p>
      <p style="font-size:13px;color:var(--ink-3);margin-top:10px;">${p.quoteLimit === Infinity ? "Unlimited quotes" : `${p.quoteLimit} quotes per month`}</p>
      <ul style="margin-top:14px;">${p.features.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      <a class="btn-gold" href="/" style="margin-top:8px;">${esc(p.cta)}</a>
    </div>`).join("");
  const faqHtml = FAQS.map(f => `<div class="card" style="margin-bottom:12px;"><h3 style="margin-top:0;">${f.q}</h3><div>${f.a}</div></div>`).join("");
  const body = `<div class="wrap">
    ${breadcrumbs([{ name: "Home", path: "/" }, { name: "Pricing" }])}
    <div class="eyebrow">Pricing</div>
    <h1>Simple plans for every crew size</h1>
    <p class="lede">${TRIAL.days}-day free trial, ${TRIAL.quotes} quotes included, no card required. Cancel anytime.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:28px;">${planCards}</div>
    <h2>Questions, answered.</h2>
    ${faqHtml}
  </div>`;
  const offers = PLANS.map(p => ({
    "@type": "Offer",
    name: p.name,
    price: String(p.monthlyPrice),
    priceCurrency: "USD",
    description: p.tagline
  }));
  write("pricing/index.html", page({
    path: "/pricing/",
    title: "Pricing | Anchor — Window Install Quoting",
    description: `Plans from ${money(PLANS[0].monthlyPrice)}/mo. ${TRIAL.days}-day free trial with ${TRIAL.quotes} quotes included, no card required.`,
    bodyHtml: body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Anchor",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers,
        description: "Window and door install quoting software for Florida contractors."
      },
      breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing/" }])
    ]
  }));
}

// ============================================================================
// /legal/terms/, /legal/privacy/, /legal/disclaimers/, /legal/cookies/
// (URL segment "disclaimers" maps to the legalDocs() key "disclaimer".)
// ============================================================================
const LEGAL_PAGES = [
  { slug: "terms", key: "terms" },
  { slug: "privacy", key: "privacy" },
  { slug: "disclaimers", key: "disclaimer" },
  { slug: "cookies", key: "cookies" }
];
for (const { slug, key } of LEGAL_PAGES) {
  const doc = LEGAL_DOCS[key];
  if (!doc) throw new Error(`legalDocs() has no "${key}" entry`);
  const body = `<div class="wrap" style="max-width:760px;">
    ${breadcrumbs([{ name: "Home", path: "/" }, { name: doc.title }])}
    <h1>${esc(doc.title)}</h1>
    <div>${doc.html}</div>
  </div>`;
  write(`legal/${slug}/index.html`, page({
    path: `/legal/${slug}/`,
    title: `${doc.title} | Anchor`,
    description: `${doc.title} for Anchor, window and door install quoting software from ${LEGAL_P.company}.`,
    bodyHtml: body,
    jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: doc.title, path: `/legal/${slug}/` }])]
  }));
}

// ============================================================================
// robots.txt + sitemap.xml
// ============================================================================
write("robots.txt", `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

const sitemapUrls = [
  "/",
  "/pricing/",
  "/learn/",
  ...allTopics.map(({ topic }) => `/learn/${topic.slug}/`),
  ...LEGAL_PAGES.map(p => `/legal/${p.slug}/`)
];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;
write("sitemap.xml", sitemapXml);

// ----------------------------------------------------------------------------
console.log(`Generated ${written.length} files into ${relative(process.cwd(), OUT) || "."}:`);
for (const f of written) console.log("  " + f);
