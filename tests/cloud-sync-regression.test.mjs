import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extractFunction(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`could not extract ${name}`);
}

const context = {
  okCount: 0,
  errors: [],
  crypto: {
    randomUUID: () => "11111111-2222-4333-8444-555555555555",
  },
};
context.markCloudOk = () => { context.okCount++; };
context.markCloudError = (err) => { context.errors.push(err); };
vm.createContext(context);

vm.runInContext(`
${extractFunction("isUuid")}
${extractFunction("draftIdFor")}
${extractFunction("firstLoginJobRows")}
${extractFunction("trackCloud")}
globalThis.api = { isUuid, draftIdFor, firstLoginJobRows, trackCloud };
`, context);

await assert.rejects(
  context.api.trackCloud(Promise.resolve({ data: null, error: new Error("RLS denied") })),
  /RLS denied/,
);
assert.equal(context.okCount, 0, "failed Supabase responses must not mark cloud healthy");
assert.equal(context.errors.length, 1, "failed Supabase responses must mark cloud offline");

const ok = await context.api.trackCloud(Promise.resolve({ data: [{ id: 1 }], error: null }));
assert.deepEqual(ok.data, [{ id: 1 }]);
assert.equal(context.okCount, 1, "successful Supabase responses mark cloud healthy");

const userId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const rows = context.api.firstLoginJobRows([
  { id: "bad-local-id", name: "saved with local id" },
  { id: "22222222-2222-4222-8222-222222222222", name: "saved with uuid" },
  { id: "33333333-3333-4333-8333-333333333333", isDraft: true, name: "older draft", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "44444444-4444-4444-8444-444444444444", isDraft: true, name: "newer draft", updatedAt: "2026-01-02T00:00:00.000Z" },
], userId);

assert.equal(rows.length, 3, "saved jobs plus one canonical draft should be uploaded");
const draftRows = rows.filter(r => r.data.isDraft);
assert.equal(draftRows.length, 1, "duplicate local drafts collapse before upload");
assert.equal(draftRows[0].id, context.api.draftIdFor({ id: userId }));
assert.equal(draftRows[0].data.name, "newer draft", "newest draft wins migration");

const savedLocal = rows.find(r => r.data.name === "saved with local id");
assert.equal(savedLocal.id, "11111111-2222-4333-8444-555555555555");
assert.equal(savedLocal.data.id, savedLocal.id, "replacement ids are written into row data");

console.log("cloud sync regression tests passed");
