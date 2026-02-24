import type { Context } from "@resonatehq/sdk";
import { transitionTo, type OrderState, type Transition } from "./transitions";

// ---------------------------------------------------------------------------
// Order Lifecycle State Machine
// ---------------------------------------------------------------------------
//
// Models an order entity as a durable generator. The generator's position
// IS the current state — no separate state store, no ctx.get/set required.
//
// Valid paths:
//   deliver: created → confirmed → shipped → delivered
//   cancel:  created → confirmed → cancelled → refunded
//   crash:   created → confirmed → shipped (CRASH) → shipped (retry) → delivered
//
// Each yield* ctx.run() is an independent checkpoint. On crash:
//   ✓ Completed transitions return from cache — not re-executed
//   ✓ The generator resumes at the first uncompleted transition
//   ✓ No transition fires twice (exactly-once semantics within the workflow)
//
// Restate equivalent uses a Virtual Object with ctx.get("status") / ctx.set:
//   const status = await ctx.get("status") ?? "NEW";
//   switch (status) { case "NEW": ... case "CONFIRMED": ... }
//   ctx.set("status", "CONFIRMED");
//
// Resonate equivalent: just sequential code. The switch/case IS the generator.

export interface OrderResult {
  orderId: string;
  finalState: OrderState;
  history: Transition[];
}

export function* orderLifecycle(
  ctx: Context,
  orderId: string,
  path: "deliver" | "cancel" | "crash",
): Generator<any, OrderResult, any> {
  const history: Transition[] = [];

  // ── CREATED ──────────────────────────────────────────────────────────────
  // Order placed: payment method on file, items reserved.
  history.push(yield* ctx.run(transitionTo, orderId, null, "created"));

  // ── CONFIRMED ────────────────────────────────────────────────────────────
  // Payment verified, restaurant / warehouse accepted the order.
  history.push(
    yield* ctx.run(transitionTo, orderId, "created", "confirmed"),
  );

  if (path === "cancel") {
    // ── CANCELLED ──────────────────────────────────────────────────────────
    // Customer cancelled before shipment.
    history.push(
      yield* ctx.run(transitionTo, orderId, "confirmed", "cancelled"),
    );

    // ── REFUNDED ──────────────────────────────────────────────────────────
    // Refund issued to original payment method.
    history.push(
      yield* ctx.run(transitionTo, orderId, "cancelled", "refunded"),
    );

    return { orderId, finalState: "refunded", history };
  }

  // ── SHIPPED ───────────────────────────────────────────────────────────────
  // Carrier API called to create label and dispatch.
  // In "crash" mode: first attempt throws (API timeout), Resonate retries.
  // On retry: the ctx.run() checkpoint fires again with a fresh attempt.
  // The transitions before this one are NOT re-executed — they're cached.
  history.push(
    yield* ctx.run(
      transitionTo,
      orderId,
      "confirmed",
      "shipped",
      path === "crash", // shouldCrash
    ),
  );

  // ── DELIVERED ─────────────────────────────────────────────────────────────
  // Carrier confirmed delivery to customer.
  history.push(
    yield* ctx.run(transitionTo, orderId, "shipped", "delivered"),
  );

  return { orderId, finalState: "delivered", history };
}
