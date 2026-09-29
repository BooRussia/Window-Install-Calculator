// Regression tests for Ask Anchor (the voice assistant), from the first-release
// bugs the owner hit on 2026-09-28:
//
//  1. "I'm not getting any voice feedback" — sb.functions.invoke() reads an
//     audio/mpeg response as TEXT, mangling the MP3, and voiceSpeak quietly gave
//     up. Audio must be fetched directly and arrive as the exact bytes sent.
//  2. "What's our highest profit job?" → "I don't have access to profit info" —
//     the assistant was never sent cost/profit. It must be, for every job, with
//     ready-made top-by-profit lists (falling back to price − cost when a job has
//     no saved profit).
//
// Runs the REAL askJobMoney / askProfitRollups / voiceFetchSpeech from index.html.
//
// Run:  node tools/ask-anchor.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

function extractFn(name) {
  const m = new RegExp("(^|\\n)(async )?function " + name + "\\(").exec(html);
  if (!m) throw new Error("no fn " + name);
  const start = m.index + (m[1] ? 1 : 0);
  let depth = 0, i = html.indexOf("{", start);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("unbalanced " + name);
}
function extractLine(re) {
  const m = re.exec(html);
  if (!m) throw new Error("no line " + re);
  return m[0];
}

const calls = [];
const audio = new Uint8Array(Array.from({ length: 600 }, (_, i) => (i * 37 + 200) % 256)); // high bytes: text decoding would corrupt these
const sandbox = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  sb: { auth: { getSession: async () => ({ data: { session: { access_token: "user-token" } } }) } },
  fetch: async (url, opts) => {
    calls.push({ url, opts });
    return new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  },
};
vm.createContext(sandbox);
vm.runInContext([
  extractLine(/^const JOB_STATUSES = .*$/m),
  extractLine(/^const LEGACY_STATUS_MAP = .*$/m),
  extractFn("jobStatus"),
  extractFn("jobIsWon"),
  extractFn("askJobMoney"),
  extractFn("askProfitRollups"),
  extractFn("voiceFetchSpeech"),
].join("\n"), sandbox);

// ── 1. voice bytes survive ────────────────────────────────────────────────────
{
  const bytes = await vm.runInContext('voiceFetchSpeech("hello")', sandbox);
  assert.equal(bytes.byteLength, audio.length, "audio length must match what the server sent");
  assert.deepEqual(Array.from(new Uint8Array(bytes)), Array.from(audio), "audio bytes must be untouched");
  const c = calls[0];
  assert.equal(c.url, "https://example.supabase.co/functions/v1/voice-tts");
  assert.equal(c.opts.headers.Authorization, "Bearer user-token");
  assert.equal(c.opts.headers.apikey, "anon-key");
  assert.equal(JSON.parse(c.opts.body).text, "hello");
  console.log("ok  voice audio arrives as exact bytes (direct fetch, user token)");
}
{
  sandbox.fetch = async () => new Response("{}", { status: 502 });
  await assert.rejects(() => vm.runInContext('voiceFetchSpeech("x")', sandbox), /voice-tts 502/);
  sandbox.fetch = async () => new Response(new Uint8Array(10), { status: 200 });
  assert.equal(await vm.runInContext('voiceFetchSpeech("x")', sandbox), null, "a tiny/empty body is not audio");
  console.log("ok  a failed or empty voice response is reported, not played");
}

// ── 2. profit reaches the assistant ───────────────────────────────────────────
const job = (id, name, status, price, cost, profit) => ({ id, name, customerName: name.split(" ")[0], status, sellingPrice: price, totalCost: cost, profit });
const jobs = [
  job("a", "Smith Remodel", "Approved", 14000, 9800, 4200),
  job("b", "Garcia Block", "Quoted", 9830, 7000, 2830),
  job("c", "Lee NewBuild", "Finished", 21943, 15000, 6943),
  job("d", "Ruiz NoProfitField", "Won", 5000, 3500, undefined),   // legacy "Won" + no saved profit
  job("e", "Empty Draftish", "Approved", 0, 0, 0),
  job("f", "Lost Big", "Lost", 40000, 20000, 20000),
];
{
  const m = vm.runInContext("askJobMoney", sandbox)(jobs[3]);
  assert.deepEqual({ ...m }, { price: 5000, cost: 3500, profit: 1500, profitPct: 30 }, "no saved profit → price − cost");
  const z = vm.runInContext("askJobMoney", sandbox)(jobs[4]);
  assert.equal(z.profitPct, null, "no price → no percent, not NaN/Infinity");
  console.log("ok  per-job money (falls back to price − cost; no divide-by-zero)");
}
{
  const r = vm.runInContext("askProfitRollups", sandbox)(jobs);
  assert.equal(r.topWonByProfit[0].name, "Lee NewBuild", "most profitable WON job");
  assert.equal(r.topWonByProfit[0].profit, 6943);
  assert.equal(r.topByProfit[0].name, "Lost Big", "most profitable of everything includes lost/quoted");
  assert.ok(!r.topWonByProfit.some(j => j.name === "Lost Big" || j.name === "Garcia Block"), "quoted/lost jobs are not 'won'");
  assert.ok(!r.topByProfit.some(j => j.name === "Empty Draftish"), "zero-price jobs never rank");
  assert.equal(r.wonTotals.jobs, 4);                                  // Smith, Lee, Ruiz(Won→Approved), Empty
  assert.equal(r.wonTotals.profit, 4200 + 6943 + 1500);
  assert.equal(r.wonTotals.revenue, 14000 + 21943 + 5000);
  assert.equal(r.wonTotals.profitPct, Math.round((4200 + 6943 + 1500) / (14000 + 21943 + 5000) * 100));
  assert.equal(r.allTotals.jobs, 6);
  assert.ok(r.topJobs.every(j => jobs.includes(j)), "topJobs are real saved jobs (so 'open it' works)");
  console.log("ok  top-by-profit lists and totals");
}

console.log("all ask-anchor tests passed");
