import type { Context } from "@resonatehq/sdk";

// ---------------------------------------------------------------------------
// Order State Machine — State Types
// ---------------------------------------------------------------------------
//
// Valid state graph:
//
//   created ──► confirmed ──► shipped ──► delivered
//                   │
//                   └──────► cancelled ──► refunded
//
// Transitions are enforced by the generator's sequential execution.
// You cannot reach "shipped" without first passing through "confirmed"
// because the generator simply hasn't reached that ctx.run() call yet.
//
// Compare to Restate's approach: ctx.get("status") / ctx.set("status")
// Resonate: the generator's position IS the status. No K/V store needed.

export type OrderState =
  | "created"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface Transition {
  orderId: string;
  from: OrderState | null;
  to: OrderState;
  timestamp: string;
}

// Track per-state attempt counts for crash simulation
const attemptMap = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// transitionTo — the single durable step in the state machine
// ---------------------------------------------------------------------------
// Each call is wrapped in ctx.run(), making it a checkpoint.
// On crash + resume, completed transitions are returned from cache.
// The shouldCrash flag simulates a carrier API failure during shipping.

export async function transitionTo(
  _ctx: Context,
  orderId: string,
  from: string | null,
  to: string,
  shouldCrash = false,
): Promise<Transition> {
  const key = `${orderId}:${to}`;
  const attempt = (attemptMap.get(key) ?? 0) + 1;
  attemptMap.set(key, attempt);

  // Simulate processing work for this transition
  await sleep(60);

  if (shouldCrash && attempt === 1) {
    console.log(
      `  [${orderId}]  ${from ?? "—"} → ${to}  ✗  (carrier API timeout, retrying...)`,
    );
    throw new Error(
      `Carrier API timeout during shipment creation for order ${orderId}`,
    );
  }

  const retryTag = attempt > 1 ? ` (retry ${attempt})` : "";
  console.log(`  [${orderId}]  ${from ?? "—"} → ${to}${retryTag}  ✓`);

  return {
    orderId,
    from: from as OrderState | null,
    to: to as OrderState,
    timestamp: new Date().toISOString(),
  };
}
