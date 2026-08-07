// Regression: Viwinco-style dealer quote PDFs must parse into OPENING lines
// without calling the AI vision path.
//
// Run:  node tools/dealer-quote-parse.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("Could not find function " + name);
  let depth = 0, seen = false, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") { depth++; seen = true; }
    else if (ch === "}") { depth--; if (seen && depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const fnSrc = ["looksLikeDealerQuote", "parseDealerQuoteToExtraction"]
  .map((n) => extractFn(html, n)).join("\n\n");
const api = new Function(fnSrc + "\nreturn { looksLikeDealerQuote, parseDealerQuoteToExtraction };")();

const sample = `
Viwinco Dealer Quote Quote Date: Aug 1, 2026 Quote Number: 00750015
Job Name: MODEL 5000 PRIME GLAZING SOLUTIONS 5100 FLORIDA Sold To: Ship To:
Line # Qty Ordered Order Specifications
0001 1 S-Series Mulled Units 2U-2R1C CONFIG: 2U - 2R1C APPLICATION: NEW CONSTRUCTION (NON - IMPACT)
MEASURE CODE: MAKE SIZE OVERALL WIDTH: 35.5000 OVERALL HEIGHT: 96.0000
WINDOW TAG: # 2 [QTY 1] Florida Approval (All Units): 46985.2
0006 2 S-Series Picture APPLICATION: NEW CONSTRUCTION (NON - IMPACT) MEASURE CODE: MAKE SIZE
WIDTH: 36.0000 HEIGHT: 76.0000 WINDOW TAG: # 10 & 11 [QTY 2] Florida Approval: 46985.2
0028 1 Price Discount - 8.00% of Cost
`.trim();

assert.equal(api.looksLikeDealerQuote(sample), true);
assert.equal(api.looksLikeDealerQuote("just a photo of a wall"), false);

const extracted = api.parseDealerQuoteToExtraction(sample);
assert.match(extracted, /^MANUFACTURER: Viwinco/m);
assert.match(extracted, /^PROJECT: MODEL 5000$/m);
const openings = extracted.split("\n").filter((l) => /^OPENING\s*\|/i.test(l));
assert.equal(openings.length, 2);
assert.match(openings[0], /35\.5 \| 96 \| 1 \| window \| nominal/);
assert.match(openings[1], /36 \| 76 \| 2 \| window \| nominal/);
assert.match(extracted, /APPROVAL \| FL46985\.2/);
assert.doesNotMatch(extracted, /Price Discount/);

console.log("dealer-quote-parse.test.mjs: ok");
