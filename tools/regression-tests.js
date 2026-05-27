#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function sliceBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return html.slice(start, end);
}

function loadStorageApi(storage) {
  const storageScript = sliceBetween("const DEFAULT_DATA = ", "let DATA = loadData();");
  const context = {
    console,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    pushProfileToCloud() {}
  };
  vm.createContext(context);
  vm.runInContext(`${storageScript}
globalThis.__api = { DEFAULT_DATA, LS_KEYS, loadData, mergeData, clone, flSeedKey };`, context);
  return context.__api;
}

async function testFbcRetryClearsLoadError() {
  const fbcScript = sliceBetween("const FBC_INDEX_URL_GZ", "// Search the FBC index");
  let fetchCalls = 0;
  const context = {
    console,
    performance: { now: () => 0 },
    window: { track() {} },
    fetch: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ approvals: [] }) };
    }
  };
  vm.createContext(context);
  vm.runInContext(`${fbcScript}
globalThis.__fbc = {
  loadFbcIndex,
  get error() { return _fbcLoadError; },
  get cache() { return _fbcCache; }
};`, context);

  await assert.rejects(() => context.__fbc.loadFbcIndex(), /FBC index HTTP 503/);
  assert.ok(context.__fbc.error, "first failed load should record an error");

  const cache = await context.__fbc.loadFbcIndex();
  assert.deepEqual(cache, { approvals: [] });
  assert.equal(context.__fbc.error, null, "successful retry should clear the stale error");
}

async function main() {
  const storage = new Map();
  const { DEFAULT_DATA, LS_KEYS, loadData, clone, flSeedKey } = loadStorageApi(storage);

  function saveRawData(data) {
    storage.set(LS_KEYS.data, JSON.stringify(data));
  }

  const customized = clone(DEFAULT_DATA);
  delete customized.config.flSeedV;
  customized.config.ratesCustomized = true;
  customized.manufacturerRates.Viwinco = {
    nailfin: { impact: 9.9, nonImpact: 8.8 },
    throughFrame: { impact: 7.7, nonImpact: 6.6 },
    alwaysImpactSpec: false
  };
  saveRawData(customized);
  let loaded = loadData();
  assert.equal(loaded.config.flSeedV, 1);
  assert.deepEqual(loaded.manufacturerRates.Viwinco, customized.manufacturerRates.Viwinco);

  const untouched = clone(DEFAULT_DATA);
  delete untouched.config.flSeedV;
  untouched.config.ratesCustomized = false;
  untouched.manufacturerRates.Viwinco = {
    nailfin: { impact: 2, nonImpact: 2 },
    throughFrame: { impact: 1, nonImpact: 1 },
    alwaysImpactSpec: false
  };
  saveRawData(untouched);
  loaded = loadData();
  assert.deepEqual(loaded.manufacturerRates.Viwinco, DEFAULT_DATA.manufacturerRates.Viwinco);

  const deletedSeed = clone(DEFAULT_DATA);
  delete deletedSeed.config.flSeedV;
  deletedSeed.config.deletedFlSeedFls = ["fl29512-r2"];
  deletedSeed.flApprovals.Viwinco = deletedSeed.flApprovals.Viwinco
    .filter(entry => !(entry.fls || []).map(flSeedKey).includes("FL29512-R2"));
  saveRawData(deletedSeed);
  loaded = loadData();
  assert.equal(
    loaded.flApprovals.Viwinco.some(entry => (entry.fls || []).map(flSeedKey).includes("FL29512-R2")),
    false,
    "deleted seeded approvals should not be reseeded"
  );

  const missingSeed = clone(DEFAULT_DATA);
  delete missingSeed.config.flSeedV;
  missingSeed.flApprovals.Viwinco = missingSeed.flApprovals.Viwinco
    .filter(entry => !(entry.fls || []).map(flSeedKey).includes("FL29512-R2"));
  saveRawData(missingSeed);
  loaded = loadData();
  assert.equal(
    loaded.flApprovals.Viwinco.some(entry => (entry.fls || []).map(flSeedKey).includes("FL29512-R2")),
    true,
    "missing, non-deleted seeded approvals should still be added"
  );

  await testFbcRetryClearsLoadError();

  console.log("regression tests passed");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
