import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extractFunctionSource(source, functionName) {
  const marker = `function ${functionName}()`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not find end of ${functionName}`);
}

const context = {
  DATA: {
    config: {
      laborModel: {
        setupMinPerOpening: 45,
        mobilizationHours: 2,
        crewSize: 3,
        crewPayRatePerHr: 35,
      },
      swingDoors: {
        enabled: true,
        rates: {
          single: { labor: 75 },
          double: { labor: 105 },
        },
      },
    },
    costItems: [{ id: "labor", unitPrice: 75 }],
  },
  STATE: {
    totalLF: "100",
    windowCount: "10",
    swingDoors: { single: 1, double: 2 },
  },
  getLaborPerLF: () => 0.5,
};

vm.createContext(context);
vm.runInContext(
  `${extractFunctionSource(html, "estimateLaborBreakdown")}
this.estimateLaborBreakdown = estimateLaborBreakdown;`,
  context
);

const result = context.estimateLaborBreakdown();

assert.equal(result.setupHrs, 9.75);
assert.equal(result.windowInstallHrs, 50);
assert.equal(result.doorInstallHrs, 4.75);
assert.equal(result.mobilizationHrs, 2);
assert.equal(result.totalHrs, 66.5);
assert.equal(result.customerLaborTotal, 4987.5);
assert.equal(result.crewPayTotal, 6982.5);
assert.equal(result.effectivePerLF, 49.875);
assert.deepEqual(
  result.breakdown.map(row => row.label),
  [
    "Mobilization (load \u00b7 drive \u00b7 stage)",
    "Per-opening setup (13 openings \u00d7 45 min)",
    "Window install (100 LF \u00d7 30.0 min/LF)",
    "Door install (3 doors)",
  ]
);
