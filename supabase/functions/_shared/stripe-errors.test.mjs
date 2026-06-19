import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./stripe-errors.ts", import.meta.url), "utf8");
const match = source.match(/export function isMissingStripeCustomer\(err\) \{[\s\S]*?\n\}/);
assert.ok(match, "isMissingStripeCustomer function should be present");

const isMissingStripeCustomer = new Function(
  `${match[0].replace("export ", "")}; return isMissingStripeCustomer;`,
)();

assert.equal(
  isMissingStripeCustomer({
    code: "resource_missing",
    param: "customer",
    message: "No such customer: 'cus_missing'",
  }),
  true,
);

assert.equal(
  isMissingStripeCustomer({
    raw: {
      code: "resource_missing",
      param: "customer",
      message: "No such customer: 'cus_missing'",
    },
  }),
  true,
);

assert.equal(
  isMissingStripeCustomer({
    code: "resource_missing",
    param: "line_items[0][price]",
    message: "No such price: 'price_missing'",
  }),
  false,
);

assert.equal(
  isMissingStripeCustomer({
    code: "resource_missing",
    message: "No such price: 'price_missing'",
  }),
  false,
);

assert.equal(
  isMissingStripeCustomer({
    code: "resource_missing",
    param: "subscription",
    message: "No such subscription: 'sub_missing'",
  }),
  false,
);
