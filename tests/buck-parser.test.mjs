import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("const BUCK_DIM_TYPES");
const end = html.indexOf("// Parse the AI's \"APPROVAL", start);

assert.notEqual(start, -1, "buck parser start marker not found");
assert.notEqual(end, -1, "buck parser end marker not found");

const context = {
  DATA: { config: { buckDimDefault: "nominal" } },
};
vm.createContext(context);
vm.runInContext(
  `${html.slice(start, end)}\nglobalThis.parseOpenings = parseOpenings;`,
  context,
);

let rows = context.parseOpenings("OPENING | Bed | 36 | 48 | 1 | window");
assert.equal(rows.length, 1);
assert.equal(rows[0].dimType, "nominal");
assert.equal(rows[0].dimInferred, true);
assert.equal(rows[0].width, 39.5);
assert.equal(rows[0].height, 51.5);

context.DATA.config.buckDimDefault = "ro";
rows = context.parseOpenings("OPENING | Bed | 36 | 48 | 1 | window");
assert.equal(rows[0].dimType, "ro");
assert.equal(rows[0].width, 39);
assert.equal(rows[0].height, 51);

rows = context.parseOpenings("OPENING | Bed | 36 | 48 | 1 | window | mo");
assert.equal(rows[0].dimType, "mo");
assert.equal(rows[0].dimInferred, false);
assert.equal(rows[0].width, 36);
assert.equal(rows[0].height, 48);

console.log("buck-parser tests passed");
