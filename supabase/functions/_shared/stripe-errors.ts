// Stripe uses the same `resource_missing` code for customers, prices, and
// other objects. Checkout should only recreate a customer for stale customer IDs.
// deno-lint-ignore no-explicit-any
export function isMissingStripeCustomer(err: any): boolean {
  const raw = err?.raw;
  const code = err?.code ?? raw?.code;
  const param = err?.param ?? raw?.param;
  const message = `${err?.message ?? ""} ${raw?.message ?? ""}`;

  return /no such customer/i.test(message) ||
    (code === "resource_missing" && param === "customer");
}
