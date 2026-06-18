import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("const BUCK_RULES =");
const end = html.indexOf("\nasync function openGrokBuckPrompt", start);

assert.notEqual(start, -1, "buck calculator section not found");
assert.notEqual(end, -1, "buck calculator section end not found");

const context = {
  DATA: { config: {} },
  STATE: { buckList: null },
  document: {
    getElementById() {
      return {
        classList: { add() {}, remove() {}, toggle() {} },
        querySelectorAll() { return []; },
        addEventListener() {},
        innerHTML: "",
        textContent: "",
      };
    },
  },
  buckLumberName() {
    return "2x";
  },
  escHtml(value) {
    return String(value);
  },
  saveData() {},
  renderBuckResult() {},
  render() {},
};

vm.createContext(context);
vm.runInContext(
  `${html.slice(start, end)}
globalThis.__buck = {
  buckDimDefault,
  masonryFromRaw,
  optimizeCutList,
  parseOpenings,
  setBuckDimDefault
};`,
  context,
);

const buck = context.__buck;

function parseWithDefault(defaultType, text) {
  context.DATA.config = defaultType ? { buckDimDefault: defaultType } : {};
  return buck.parseOpenings(text);
}

{
  const [op] = parseWithDefault(null, "OPENING | Kitchen | 36 | 60 | 1 | window");
  assert.equal(op.dimType, "nominal");
  assert.equal(op.dimExplicit, false);
  assert.equal(op.width, 39.5);
  assert.equal(op.height, 63.5);
}

{
  const [op] = parseWithDefault("mo", "OPENING | Garage | 40 | 64 | 1 | window");
  assert.equal(op.dimType, "mo");
  assert.equal(op.dimExplicit, false);
  assert.equal(op.width, 40);
  assert.equal(op.height, 64);
}

{
  const [op] = parseWithDefault(null, "OPENING | Bath | 36 | 48 | 1 | nominal");
  assert.equal(op.dimType, "nominal");
  assert.equal(op.dimExplicit, true);
  assert.equal(op.width, 39.5);
  assert.equal(op.height, 51.5);
  assert.equal(op.isSlider, false);
  assert.equal(op.isBifold, false);
}

{
  const [op] = parseWithDefault(null, "OPENING | Patio | 72 | 80 | 1 | nominal | sliding glass door | 3");
  assert.equal(op.dimType, "nominal");
  assert.equal(op.dimExplicit, true);
  assert.equal(op.isSlider, true);
  assert.equal(op.panels, 3);
}

{
  context.DATA.config = { buckDimDefault: "nominal" };
  const [tagged] = buck.parseOpenings("OPENING | Tagged | 36 | 48 | 1 | window | nominal");
  const [unlabeled] = buck.parseOpenings("OPENING | Unlabeled | 36 | 48 | 1 | window");

  context.STATE.buckList = buck.optimizeCutList([tagged, unlabeled]);
  buck.setBuckDimDefault("mo");

  const byRoom = new Map(context.STATE.buckList.openings.map((op) => [op.room, op]));
  assert.equal(byRoom.get("Tagged").dimType, "nominal");
  assert.equal(byRoom.get("Tagged").dimExplicit, true);
  assert.equal(byRoom.get("Tagged").width, 39.5);
  assert.equal(byRoom.get("Unlabeled").dimType, "mo");
  assert.equal(byRoom.get("Unlabeled").dimExplicit, false);
  assert.equal(byRoom.get("Unlabeled").width, 36);
}

console.log("buck parser regression tests passed");
