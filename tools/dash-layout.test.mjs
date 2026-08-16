// Regression tests for dashboard launchpad layout isolation.
//
// PRIMARY GUARANTEE: picking a card's 1/2/3 size must write ONLY that card's
// span. The old fillDashSpanRows path grew a neighbour so a row never trailed
// a gap — shrinking a 3 to a 1 turned the next card from 1 into 2.
//
// Also: layouts persist independently per viewport band (phone / laptop /
// ultrawide). A missing band loads THAT band's recommended defaults — never
// a copy of a smaller band. Persist writes the whole dashLayouts map but
// only mutates the active breakpoint (RGL #2110).
//
// These extract the REAL helpers from index.html. Run:
//   node tools/dash-layout.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("Could not find function " + name + " in index.html");
  let depth = 0, seen = false, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") { depth++; seen = true; }
    else if (ch === "}") { depth--; if (seen && depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const NEEDED = [
  "dashLayoutBand", "emptyDashLayoutCfg", "cloneDashLayoutCfg", "dashLayoutCfgHasContent",
  "dashCardDefaultSpan", "migrateDashOvLayout", "migrateDashLayouts",
  "resolveDashLayout", "persistDashLayout", "setDashCardSpan", "setDashCardSpanRecommended",
  "dashResetLayout", "dashMove", "dashSpanRows", "fillDashSpanRows",
];
const fnSrc = NEEDED.map(n => extractFn(html, n)).join("\n\n");

const DASH_CARDS = [
  { key: "followups" },
  { key: "pipeline", defaultSpan: 2 },
  { key: "booked", defaultSpan: 2 },
  { key: "jobs", rich: true, defaultSpan: 2 },
  { key: "shopping" },
];
const DASH_DEFAULT_ORDER = ["followups", "pipeline", "booked", "jobs", "shopping"];
const DASH_LAYOUT_BANDS = ["phone", "laptop", "ultrawide"];

function makeEnv(innerWidth) {
  const windowObj = { innerWidth: innerWidth == null ? 1100 : innerWidth };
  const DATA = { config: {} };
  const saves = [];
  const saveData = (d) => { saves.push(JSON.parse(JSON.stringify(d))); };
  const refreshDashLaunchpad = () => {};
  const toast = () => {};
  const factory = new Function(
    "window", "DATA", "DASH_CARDS", "DASH_DEFAULT_ORDER", "DASH_LAYOUT_BANDS",
    "saveData", "refreshDashLaunchpad", "toast",
    fnSrc + "\nreturn { dashLayoutBand, emptyDashLayoutCfg, cloneDashLayoutCfg, dashLayoutCfgHasContent, dashCardDefaultSpan, migrateDashLayouts, resolveDashLayout, persistDashLayout, setDashCardSpan, setDashCardSpanRecommended, dashResetLayout, dashMove, fillDashSpanRows };"
  );
  return {
    api: factory(windowObj, DATA, DASH_CARDS, DASH_DEFAULT_ORDER, DASH_LAYOUT_BANDS,
      saveData, refreshDashLaunchpad, toast),
    DATA, window: windowObj, saves,
  };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log("ok  " + name);
}

check("dashLayoutBand keys phone / laptop / ultrawide by width", () => {
  const { api } = makeEnv();
  assert.equal(api.dashLayoutBand(320), "phone");
  assert.equal(api.dashLayoutBand(699), "phone");
  assert.equal(api.dashLayoutBand(700), "laptop");
  assert.equal(api.dashLayoutBand(1439), "laptop");
  assert.equal(api.dashLayoutBand(1440), "ultrawide");
  assert.equal(api.dashLayoutBand(2560), "ultrawide");
});

check("dashCardDefaultSpan uses pipeline/booked/jobs = 2, tiles = 1; never 3 on ultrawide", () => {
  const { api } = makeEnv();
  assert.equal(api.dashCardDefaultSpan("pipeline"), 2);
  assert.equal(api.dashCardDefaultSpan("booked"), 2);
  assert.equal(api.dashCardDefaultSpan("jobs"), 2);
  assert.equal(api.dashCardDefaultSpan("followups"), 1);
  assert.equal(api.dashCardDefaultSpan("shopping"), 1);
  assert.equal(api.dashCardDefaultSpan("jobs", "ultrawide"), 2);
  assert.equal(api.dashCardDefaultSpan("pipeline", "ultrawide"), 2);
  DASH_CARDS.find(c => c.key === "pipeline").defaultSpan = 3;
  assert.equal(api.dashCardDefaultSpan("pipeline", "ultrawide"), 2, "never recommend 3 on 4-col");
  assert.equal(api.dashCardDefaultSpan("pipeline", "laptop"), 3, "stored/recommended 3 still ok on 3-col");
  DASH_CARDS.find(c => c.key === "pipeline").defaultSpan = 2;
});

check("legacy dashLayout lands on laptop only; other bands stay missing", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayout = {
    order: ["pipeline", "booked", "followups"],
    hidden: ["shopping"],
    spans: { pipeline: 3, booked: 1, followups: 1 },
  };
  const resolved = env.api.resolveDashLayout();
  assert.equal(resolved.band, "laptop");
  assert.deepEqual(env.DATA.config.dashLayouts.laptop.spans, { pipeline: 3, booked: 1, followups: 1 });
  assert.deepEqual(env.DATA.config.dashLayouts.laptop.hidden, ["shopping"]);
  assert.equal(env.DATA.config.dashLayouts.phone, undefined, "phone stays missing");
  assert.equal(env.DATA.config.dashLayouts.ultrawide, undefined, "ultrawide stays missing");
  assert.ok(resolved.visible.includes("jobs"), "new/missing cards still append");

  env.window.innerWidth = 1600;
  const ultra = env.api.resolveDashLayout();
  assert.equal(ultra.band, "ultrawide");
  assert.equal(ultra.spans.pipeline, 2, "missing ultrawide uses recommended 2, not laptop's 3");
  assert.equal(env.DATA.config.dashLayouts.ultrawide, undefined, "resolve must not invent ultrawide");
});

check("setDashCardSpan writes ONLY the target card on the active band", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayout = {
    order: ["pipeline", "followups", "booked", "jobs", "shopping"],
    hidden: [],
    spans: { pipeline: 3, followups: 1, booked: 2, jobs: 1, shopping: 1 },
  };
  env.api.resolveDashLayout();
  const beforeFollow = env.DATA.config.dashLayouts.laptop.spans.followups;

  env.api.setDashCardSpan("pipeline", 1);

  const laptop = env.DATA.config.dashLayouts.laptop;
  assert.equal(laptop.spans.pipeline, 1);
  assert.equal(laptop.spans.followups, beforeFollow, "neighbour span must not grow");
  assert.equal(laptop.spans.booked, 2);
  assert.equal(laptop.spans.jobs, 1);
  assert.equal(env.DATA.config.dashLayouts.phone, undefined, "phone not created from laptop write");
  assert.equal(env.DATA.config.dashLayouts.ultrawide, undefined, "ultrawide not created from laptop write");
  assert.ok(env.DATA.config.dashLayouts.laptop, "whole map still has the active band");
});

check("fillDashSpanRows WOULD have grown the neighbour — size click must not", () => {
  const env = makeEnv(1100);
  const visible = ["pipeline", "followups"];
  const grown = { pipeline: 1, followups: 1 };
  env.api.fillDashSpanRows(visible, grown, "pipeline");
  assert.equal(grown.followups, 2, "retired helper still fills — documents the old bug");

  env.DATA.config.dashLayouts = {
    phone: { order: visible, hidden: [], spans: { pipeline: 3, followups: 1 } },
    laptop: { order: visible, hidden: [], spans: { pipeline: 3, followups: 1 } },
    ultrawide: { order: visible, hidden: [], spans: { pipeline: 3, followups: 1 } },
  };
  env.api.setDashCardSpan("pipeline", 1);
  assert.equal(env.DATA.config.dashLayouts.laptop.spans.followups, 1);
});

check("setDashCardSpanRecommended restores defaultSpan only", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayouts = {
    phone: { order: ["pipeline", "booked"], hidden: [], spans: { pipeline: 1, booked: 3 } },
    laptop: { order: ["pipeline", "booked"], hidden: [], spans: { pipeline: 1, booked: 3 } },
    ultrawide: { order: ["pipeline", "booked"], hidden: [], spans: { pipeline: 1, booked: 3 } },
  };
  env.api.setDashCardSpanRecommended("pipeline");
  assert.equal(env.DATA.config.dashLayouts.laptop.spans.pipeline, 2);
  assert.equal(env.DATA.config.dashLayouts.laptop.spans.booked, 3, "other card stays");
  assert.equal(env.DATA.config.dashLayouts.phone.spans.pipeline, 1, "other band stays");
});

check("resize/load resolves the matching band without copying spans", () => {
  const env = makeEnv(1600);
  env.DATA.config.dashLayouts = {
    phone: { order: ["jobs"], hidden: [], spans: { jobs: 3 } },
    laptop: { order: ["pipeline"], hidden: [], spans: { pipeline: 1 } },
    ultrawide: { order: ["booked"], hidden: [], spans: { booked: 3 } },
  };
  const ultra = env.api.resolveDashLayout();
  assert.equal(ultra.band, "ultrawide");
  assert.equal(ultra.spans.booked, 3);
  assert.equal(ultra.spans.pipeline, 2, "unset on this band uses defaultSpan, not laptop's 1");

  env.window.innerWidth = 800;
  const laptop = env.api.resolveDashLayout();
  assert.equal(laptop.band, "laptop");
  assert.equal(laptop.spans.pipeline, 1);
  assert.equal(laptop.spans.booked, 2, "unset on laptop uses default, not ultrawide's 3");

  env.window.innerWidth = 390;
  const phone = env.api.resolveDashLayout();
  assert.equal(phone.band, "phone");
  assert.equal(phone.spans.jobs, 3);
});

check("dashResetLayout clears only the active band", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayouts = {
    phone: { order: ["jobs"], hidden: ["shopping"], spans: { jobs: 3 } },
    laptop: { order: ["pipeline", "booked"], hidden: ["jobs"], spans: { pipeline: 3, booked: 1 } },
    ultrawide: { order: ["booked"], hidden: [], spans: { booked: 3 } },
  };
  env.api.dashResetLayout();
  assert.equal(env.DATA.config.dashLayouts.laptop, undefined, "reset deletes the band key");
  assert.equal(env.DATA.config.dashLayouts.phone.spans.jobs, 3);
  assert.equal(env.DATA.config.dashLayouts.ultrawide.spans.booked, 3);
  const resolved = env.api.resolveDashLayout("laptop");
  assert.equal(resolved.spans.pipeline, 2);
  assert.equal(resolved.spans.booked, 2);
  assert.deepEqual(resolved.visible.slice(0, 3), ["followups", "pipeline", "booked"]);
});

check("persist writes the whole map and never interpolates a missing larger band", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayouts = {
    laptop: { order: ["pipeline", "followups"], hidden: [], spans: { pipeline: 3, followups: 1 } },
  };
  env.api.setDashCardSpan("pipeline", 1);
  const saved = env.saves[env.saves.length - 1];
  assert.ok(saved.config.dashLayouts.laptop, "active band present on the persisted map");
  assert.equal(saved.config.dashLayouts.phone, undefined);
  assert.equal(saved.config.dashLayouts.ultrawide, undefined);
  assert.equal(saved.config.dashLayoutBand, "laptop");

  env.window.innerWidth = 1600;
  const ultra = env.api.resolveDashLayout();
  assert.equal(ultra.spans.pipeline, 2, "missing ultrawide ≠ laptop's 1");
  assert.equal(env.DATA.config.dashLayouts.ultrawide, undefined);
});

check("dashMove reorders without rewriting spans", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayouts = {
    phone: { order: ["followups", "pipeline"], hidden: [], spans: { followups: 1, pipeline: 2 } },
    laptop: { order: ["followups", "pipeline"], hidden: [], spans: { followups: 1, pipeline: 2 } },
    ultrawide: { order: ["followups", "pipeline"], hidden: [], spans: { followups: 1, pipeline: 2 } },
  };
  env.api.dashMove("pipeline", "up");
  assert.deepEqual(env.DATA.config.dashLayouts.laptop.order.slice(0, 2), ["pipeline", "followups"]);
  assert.equal(env.DATA.config.dashLayouts.laptop.spans.followups, 1);
  assert.equal(env.DATA.config.dashLayouts.laptop.spans.pipeline, 2);
});

check("size picker and drop persist never call neighbour-fill helpers", () => {
  const setSrc = extractFn(html, "setDashCardSpan");
  assert.equal(setSrc.includes("fillDashSpanRows"), false);
  assert.equal(setSrc.includes("autoFitSpansOnDrop"), false);
  assert.equal(setSrc.includes("computeDragPreviewSpans"), false);
  const dropSrc = extractFn(html, "persistDashOrderFromDOM");
  assert.equal(dropSrc.includes("computeDragPreviewSpans"), false);
  assert.equal(dropSrc.includes("fillDashSpanRows"), false);
  const previewSrc = extractFn(html, "previewDashCardSpans");
  assert.equal(previewSrc.includes("computeDragPreviewSpans"), false);
  assert.match(html, /dec-rec-mark/);
  assert.match(html, /data-dashspanreset/);
  assert.match(html, /preventCollision/);
  assert.match(extractFn(html, "persistDashLayout"), /RGL #2110/);
  assert.equal(html.includes("shrinking its neighbour"), false);
  const mig = extractFn(html, "migrateDashLayouts");
  assert.equal(mig.includes("phone:"), false, "must not copy legacy into all three bands");
  assert.equal(mig.includes("ultrawide:"), false);
});

check("DASH_CARDS jobs is rich + defaultSpan 2; saved jobs span is kept", () => {
  const chunk = html.slice(html.indexOf('{ key: "jobs"'), html.indexOf('{ key: "jobs"') + 80);
  assert.match(chunk, /rich:\s*true/);
  assert.match(chunk, /defaultSpan:\s*2/);
  assert.match(html, /key: "pipeline", title: "Deal pipeline", rich: true, defaultSpan: 2/);
  assert.match(html, /key: "booked", title: "Booked by month", rich: true, defaultSpan: 2/);
  assert.match(html, /key: "followups", title: "Follow-ups", rich: true,/);
  assert.equal(/key: "followups"[\s\S]{0,60}defaultSpan/.test(html), false);
  assert.match(html, /if \(key === "jobs"\)[\s\S]{0,400}dashRecentJobs\(jobs, 6\)/);
  assert.match(html, /if \(key === "jobs"\)[\s\S]{0,800}dash-attn-list/);
  assert.match(html, /if \(key === "jobs"\)[\s\S]{0,800}data-attn-open/);
  assert.match(html, /No saved jobs yet — your quotes show up here\./);
  assert.match(html, /\.dash-launch-card \{[^}]*min-height: 240px;/);
  assert.match(html, /\.dash-launch-cell\.is-rich \.dash-launch-card \{[\s\S]*?min-height: max\(268px, min-content\);/);
  assert.equal(/#dashLaunchpad[^{]*\{[^}]*min-height:\s*268/.test(html), false);

  const env = makeEnv(1100);
  env.DATA.config.dashLayouts = {
    laptop: { order: ["jobs", "followups"], hidden: [], spans: { jobs: 1, followups: 1 } },
  };
  assert.equal(env.api.resolveDashLayout("laptop").spans.jobs, 1, "stored jobs span stays");
  assert.equal(env.api.resolveDashLayout("ultrawide").spans.jobs, 2, "missing band uses recommended 2");
  assert.equal(env.DATA.config.dashLayouts.ultrawide, undefined);
});

check("row = tallest; no 360 cap; no inner scroll; tiles grow in mixed rows", () => {
  assert.match(html, /\.dash-launch-cell\.is-rich \{[\s\S]*?align-self: stretch;[\s\S]*?height: auto;[\s\S]*?min-height: 100%;/);
  const richCard = html.match(/\.dash-launch-cell\.is-rich \.dash-launch-card \{[^}]+\}/);
  assert.ok(richCard, "rich card rule exists");
  assert.match(richCard[0], /flex: 1 1 auto;/);
  assert.match(richCard[0], /height: auto;/);
  assert.match(richCard[0], /min-height: max\(268px, min-content\);/);
  assert.equal(/flex: 1 1 0;/.test(richCard[0]), false, "rich card basis must be auto, not 0");
  const richBody = html.match(/\.dash-launch-cell\.is-rich \.dash-launch-body \{[^}]+\}/);
  assert.ok(richBody, "rich body rule exists");
  assert.match(richBody[0], /min-height: auto;/);
  assert.match(richBody[0], /overflow: visible;/);
  const dptRich = html.match(/\.dash-launch-cell\.is-rich \.dpt-wrap \{[^}]+\}/);
  assert.ok(dptRich, "rich .dpt-wrap rule exists");
  assert.match(dptRich[0], /flex: 0 0 auto;/);
  assert.match(dptRich[0], /overflow: visible;/);
  assert.equal(/overflow:\s*(hidden|auto)/.test(dptRich[0]), false);
  assert.equal(/\.dash-launch-cell\.is-rich \.dpt-wrap[\s\S]{0,80}overflow:\s*auto/.test(html), false);
  assert.equal(/\.dash-launch-cell\.is-rich \.dash-attn-list[\s\S]{0,80}overflow:\s*auto/.test(html), false);
  assert.equal(/\.dash-launch-cell\.is-rich[^{]*\{[^}]*max-height:\s*360px/.test(html), false);
  assert.equal(/\.dash-launch-cell\.is-rich \.dash-launch-card \{[^}]*max-height:\s*360px/.test(html), false);
  assert.match(html, /\.dash-launch-cell\.is-rich \.dash-bar-col,[\s\S]*?min-height: 0;/);
  assert.match(html, /\.dash-launch-cell\.is-rich \.dash-bar-lbl \{ flex: 0 0 auto; \}/);
  assert.match(html, /#dashLaunchpad \{ align-items: stretch; \}/);
  assert.equal(/#dashLaunchpad[^.{]*\{[^}]*align-items:\s*start/.test(html), false);
  const tileRule = html.match(/(?:^|\n)\s*\.dash-launch-card \{[^}]+\}/);
  assert.ok(tileRule, "tile .dash-launch-card rule exists");
  assert.match(tileRule[0], /min-height: 240px;/);
  assert.match(tileRule[0], /height: 100%;/);
  assert.equal(/(?:^|[^-])height:\s*240px/.test(tileRule[0]), false, "tile must be able to grow in a mixed row");
  assert.match(html, /dashRecentJobs\(jobs, 6\)/);
  assert.match(html, /\.slice\(0, 6\)/);
  assert.equal(/dashRecentJobs\(jobs,\s*(?:[9]|[1-9]\d+)/.test(html), false, "jobs page stays ~6–8");
  assert.equal(/\.dash-launch-cell\.is-rich \.dash-bars \{[^}]*min-height: 92px/.test(html), false);
  assert.equal(/editing\.is-rich \.dash-launch-body \{[^}]*margin-bottom:\s*-26px/.test(html), false);
});

console.log("\n" + passed + " checks passed");
