// Regression tests for dashboard launchpad layout isolation.
//
// PRIMARY GUARANTEE: picking a card's 1/2/3 size must write ONLY that card's
// span. The old fillDashSpanRows path grew a neighbour so a row never trailed
// a gap — shrinking a 3 to a 1 turned the next card from 1 into 2.
//
// Also: layouts persist independently per viewport band (phone / laptop /
// ultrawide). A size change on ultrawide must not rewrite laptop or phone.
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
  { key: "jobs" },
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

check("dashCardDefaultSpan uses pipeline/booked = 2, others 1", () => {
  const { api } = makeEnv();
  assert.equal(api.dashCardDefaultSpan("pipeline"), 2);
  assert.equal(api.dashCardDefaultSpan("booked"), 2);
  assert.equal(api.dashCardDefaultSpan("followups"), 1);
  assert.equal(api.dashCardDefaultSpan("jobs"), 1);
});

check("legacy dashLayout migrates once into all three bands", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayout = {
    order: ["pipeline", "booked", "followups"],
    hidden: ["shopping"],
    spans: { pipeline: 3, booked: 1, followups: 1 },
  };
  const resolved = env.api.resolveDashLayout();
  assert.equal(resolved.band, "laptop");
  assert.deepEqual(env.DATA.config.dashLayouts.phone.spans, { pipeline: 3, booked: 1, followups: 1 });
  assert.deepEqual(env.DATA.config.dashLayouts.laptop.spans, { pipeline: 3, booked: 1, followups: 1 });
  assert.deepEqual(env.DATA.config.dashLayouts.ultrawide.spans, { pipeline: 3, booked: 1, followups: 1 });
  assert.deepEqual(env.DATA.config.dashLayouts.phone.hidden, ["shopping"]);
  assert.ok(resolved.visible.includes("jobs"), "new/missing cards still append");
});

check("setDashCardSpan writes ONLY the target card on the active band", () => {
  const env = makeEnv(1100);
  env.DATA.config.dashLayout = {
    order: ["pipeline", "followups", "booked", "jobs", "shopping"],
    hidden: [],
    spans: { pipeline: 3, followups: 1, booked: 2, jobs: 1, shopping: 1 },
  };
  env.api.resolveDashLayout();
  const beforePhone = JSON.parse(JSON.stringify(env.DATA.config.dashLayouts.phone));
  const beforeUltra = JSON.parse(JSON.stringify(env.DATA.config.dashLayouts.ultrawide));
  const beforeFollow = env.DATA.config.dashLayouts.laptop.spans.followups;

  env.api.setDashCardSpan("pipeline", 1);

  const laptop = env.DATA.config.dashLayouts.laptop;
  assert.equal(laptop.spans.pipeline, 1);
  assert.equal(laptop.spans.followups, beforeFollow, "neighbour span must not grow");
  assert.equal(laptop.spans.booked, 2);
  assert.equal(laptop.spans.jobs, 1);
  assert.deepEqual(env.DATA.config.dashLayouts.phone, beforePhone, "phone band untouched");
  assert.deepEqual(env.DATA.config.dashLayouts.ultrawide, beforeUltra, "ultrawide band untouched");
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
  assert.deepEqual(env.DATA.config.dashLayouts.laptop, { order: [], hidden: [], spans: {} });
  assert.equal(env.DATA.config.dashLayouts.phone.spans.jobs, 3);
  assert.equal(env.DATA.config.dashLayouts.ultrawide.spans.booked, 3);
  const resolved = env.api.resolveDashLayout("laptop");
  assert.equal(resolved.spans.pipeline, 2);
  assert.equal(resolved.spans.booked, 2);
  assert.deepEqual(resolved.visible.slice(0, 3), ["followups", "pipeline", "booked"]);
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
  assert.equal(html.includes("shrinking its neighbour"), false);
});

console.log("\n" + passed + " checks passed");
