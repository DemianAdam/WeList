import { ConvexError } from "convex/values";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

function positive(
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (
    !raw.trim() ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximum
  )
    throw new ConvexError("CONFIGURATION_ERROR");
  return value;
}

export function guestAdmissionConfig() {
  const rate = positive("GUEST_SESSIONS_PER_MINUTE", 1000);
  const capacity = positive("GUEST_SESSION_BURST_CAPACITY", rate);
  const shards = Math.min(
    positive("GUEST_SESSION_LIMIT_SHARDS", 64, 256),
    rate,
    capacity,
  );
  return {
    kind: "token bucket" as const,
    rate,
    capacity,
    period: MINUTE,
    shards,
  };
}

export async function admitGuest(ctx: MutationCtx) {
  const limiter = new RateLimiter(components.rateLimiter, {
    guestRegistration: guestAdmissionConfig(),
  });
  const result = await limiter.limit(ctx, "guestRegistration");
  return {
    ok: result.ok,
    retryAfterMs: Math.max(1, Math.ceil(result.retryAfter ?? 1)),
  };
}
