import { Resonate } from "@resonatehq/sdk";
import { orderLifecycle } from "./workflow";

// ---------------------------------------------------------------------------
// Resonate setup
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register(orderLifecycle);

// ---------------------------------------------------------------------------
// Run the state machine demo
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const path = args.includes("--cancel")
  ? "cancel"
  : args.includes("--crash")
    ? "crash"
    : "deliver";

const orderId = `order-${Date.now()}`;

const modeDescriptions = {
  deliver: "HAPPY PATH  (created → confirmed → shipped → delivered)",
  cancel: "CANCELLATION (created → confirmed → cancelled → refunded)",
  crash:
    "CRASH DEMO   (created → confirmed → shipped CRASH → retry → delivered)",
};

console.log("=== Order Lifecycle State Machine ===");
console.log(`Mode: ${modeDescriptions[path]}`);
console.log(`Order: ${orderId}\n`);

const wallStart = Date.now();

const result = await resonate.run(
  `order/${orderId}`,
  orderLifecycle,
  orderId,
  path,
);

const wallMs = Date.now() - wallStart;

console.log("\n=== Result ===");
console.log(
  JSON.stringify(
    {
      orderId: result.orderId,
      finalState: result.finalState,
      transitions: result.history.length,
      wallTimeMs: wallMs,
    },
    null,
    2,
  ),
);

console.log("\nTransition history:");
for (const t of result.history) {
  console.log(`  ${t.from ?? "—"} → ${t.to}  (${t.timestamp})`);
}

if (path === "crash") {
  console.log(
    "\nNotice: created and confirmed each logged once (cached before crash).",
    "\nOnly shipped was retried — and only once.",
    "\ndelivered was NOT affected by the carrier API failure.",
  );
}
