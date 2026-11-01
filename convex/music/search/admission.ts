import type { Infer } from "convex/values";
import type { MutationCtx } from "../../_generated/server";
import { session } from "../../sessions/access";
import { live } from "../../events/access";
import { rate } from "../../platform/rateLimits";
import type { searchPermitArgs, localSearchPermitArgs } from "./validators";
export async function searchPermit(
  ctx: MutationCtx,
  { token, eventId }: Infer<typeof searchPermitArgs>,
) {
  const guest = await session(ctx, token, "guest");
  await live(ctx, eventId);
  if (!(await rate(ctx, "search:" + guest._id, 30)))
    return { error: "RATE_LIMITED" as const };
  return { ok: true };
}

export async function localSearchPermit(
  ctx: MutationCtx,
  { token, eventId }: Infer<typeof localSearchPermitArgs>,
) {
  const guest = await session(ctx, token, "guest");
  await live(ctx, eventId);
  if (!(await rate(ctx, "local-search:" + guest._id, 30)))
    return { error: "RATE_LIMITED" as const };
  return { ok: true };
}
