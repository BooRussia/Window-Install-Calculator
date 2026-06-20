import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function between(start, end) {
  const s = source.indexOf(start);
  assert.notEqual(s, -1, `missing start marker: ${start}`);
  const e = source.indexOf(end, s);
  assert.notEqual(e, -1, `missing end marker: ${end}`);
  return source.slice(s, e);
}

const jobsKey = "jobs";
const jobId = "11111111-1111-4111-8111-111111111111";
const store = new Map([[jobsKey, JSON.stringify([{ id: jobId, status: "Quoted", photos: [] }])]]);
const pushed = [];

const context = {
  console,
  Blob,
  Uint8Array,
  atob,
  LS_KEYS: { jobs: jobsKey },
  localStorage: {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
  },
  currentUser: { id: "user-1" },
  isUuid: () => true,
  toast: () => {},
  renderDashboard: () => {},
  renderJobDetails: () => {},
  pushJobToCloud: (job) => pushed.push(JSON.parse(JSON.stringify(job))),
  _jdJobId: null,
  PHOTO_BUCKET: "job-photos",
  _photoUrlCache: {},
};

let uploadCount = 0;
context.sb = {
  storage: {
    from: () => ({
      upload: async () => {
        uploadCount++;
        const latest = JSON.parse(store.get(jobsKey));
        latest[0].status = "Approved";
        store.set(jobsKey, JSON.stringify(latest));
        return { error: null };
      },
      remove: () => ({ error: null }),
    }),
  },
};

vm.createContext(context);
vm.runInContext(
  [
    between("function loadJobs()", "function clone"),
    between("function dataURLToBlob", "// Resolve (and cache)"),
    between("const MAX_GALLERY = 24;", "async function removeJobGalleryPhoto"),
  ].join("\n"),
  context,
);

const added = await context.addJobGalleryPhotos(jobId, ["data:image/jpeg;base64,AA=="]);
const saved = JSON.parse(store.get(jobsKey))[0];

assert.equal(uploadCount, 1, "test should exercise the async Storage upload path");
assert.equal(added, 1);
assert.equal(saved.status, "Approved", "gallery upload must not overwrite concurrent job updates");
assert.equal(saved.photos.length, 1);
assert.equal(pushed.length, 1);
assert.equal(pushed[0].status, "Approved", "cloud push should use the merged latest job");

console.log("gallery-save-race.test.mjs passed");
