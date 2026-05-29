import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.key = init.key;
    this.bubbles = !!init.bubbles;
    this.defaultPrevented = false;
    this.target = null;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeClassList {
  constructor(classes = []) {
    this.classes = new Set(classes);
  }
  add(cls) {
    this.classes.add(cls);
  }
  remove(cls) {
    this.classes.delete(cls);
  }
  contains(cls) {
    return this.classes.has(cls);
  }
}

class FakeElement {
  constructor(id, classes = []) {
    this.id = id;
    this.value = "";
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.classList = new FakeClassList(classes);
    this.innerHTML = "";
  }
  addEventListener(type, handler) {
    this.listeners[type] ||= [];
    this.listeners[type].push(handler);
  }
  dispatchEvent(event) {
    event.target = this;
    for (const handler of this.listeners[event.type] || []) handler(event);
    return !event.defaultPrevented;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  querySelector() {
    return null;
  }
  closest() {
    return null;
  }
}

function makeHarness(prefix, initialCounty = "") {
  const elements = new Map();
  const hidden = new FakeElement(`${prefix}County`);
  const search = new FakeElement(`${prefix}CountySearch`);
  const list = new FakeElement(`${prefix}CountyList`, ["hidden"]);
  hidden.value = initialCounty;
  search.value = initialCounty;
  elements.set(hidden.id, hidden);
  elements.set(search.id, search);
  elements.set(list.id, list);

  const document = {
    addEventListener() {},
    getElementById(id) {
      return elements.get(id) || null;
    },
  };

  return { document, hidden, search, list };
}

const source = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const code = [
  extractFunction(source, "setCountyValue"),
  extractFunction(source, "setupCountyCombobox"),
].join("\n\n");

function setup(prefix = "ob", initialCounty = "") {
  const harness = makeHarness(prefix, initialCounty);
  const context = vm.createContext({
    document: harness.document,
    Event: FakeEvent,
    FL_COUNTY_SURTAX: { Marion: 1, Orange: 0.5, Alachua: 1.5 },
    escHtml: s => String(s),
    materialsTaxForCounty: county => ({ Marion: 7, Orange: 6.5, Alachua: 7.5 })[county] ?? null,
  });
  vm.runInContext(code, context);
  context.setupCountyCombobox(prefix);
  return { ...harness, context };
}

{
  const { hidden, search, list } = setup();
  let changes = 0;
  hidden.addEventListener("change", () => { changes += 1; });

  search.value = "Marion";
  const enter = new FakeEvent("keydown", { key: "Enter" });
  search.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.equal(hidden.value, "Marion");
  assert.equal(search.value, "Marion");
  assert.equal(changes, 1);
  assert.equal(list.classList.contains("hidden"), true);
}

{
  const { hidden, search } = setup();
  let changes = 0;
  hidden.addEventListener("change", () => { changes += 1; });

  search.value = "Orange";
  search.dispatchEvent(new FakeEvent("keydown", { key: "Tab" }));

  assert.equal(hidden.value, "Orange");
  assert.equal(changes, 1);
}

{
  const { hidden, search } = setup("brand", "Alachua");
  let changes = 0;
  hidden.addEventListener("change", () => { changes += 1; });

  search.value = "Not a county";
  search.dispatchEvent(new FakeEvent("blur"));

  assert.equal(hidden.value, "Alachua");
  assert.equal(search.value, "Alachua");
  assert.equal(changes, 0);
}

console.log("county combobox keyboard reconciliation passed");
