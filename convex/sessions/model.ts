import type {
  IssueSessionResult,
  RegisterSessionResult,
} from "../contracts/commands";
import { ConvexError, type Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { digest } from "../platform/hashing";
import { admitGuest, guestAdmissionConfig } from "./admission";
import { success, failure } from "../contracts/results";
import type { registerSessionArgs, issueSessionArgs } from "./validators";
export async function registerSession(
  ctx: MutationCtx,
  { bootstrapToken, operationId }: Infer<typeof registerSessionArgs>,
): Promise<RegisterSessionResult> {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      operationId,
    )
  )
    throw new ConvexError({ code: "VALIDATION_ERROR" });
  const log = (outcome: string) =>
    console.info(
      JSON.stringify({ event: "guest_registration", operationId, outcome }),
    );
  if (!/^[a-f0-9]{64}$/.test(bootstrapToken)) {
    log("VALIDATION_ERROR");
    throw new ConvexError({ code: "VALIDATION_ERROR" });
  }
  try {
    guestAdmissionConfig();
  } catch (error) {
    log("CONFIGURATION_ERROR");
    throw error;
  }
  const hash = digest(bootstrapToken);
  const existing = await ctx.db
    .query("sessions")
    .withIndex("hash", (q) => q.eq("hash", hash))
    .unique();
  if (existing) {
    if (existing.role !== "guest") {
      log("VALIDATION_ERROR");
      throw new ConvexError({ code: "VALIDATION_ERROR" });
    }
    if (existing.expiresAt <= Date.now()) {
      log("SESSION_EXPIRED");
      throw new ConvexError({ code: "SESSION_EXPIRED" });
    }
    log("REUSED");
    return success({ reused: true });
  }
  const admission = await admitGuest(ctx);
  if (!admission.ok) {
    log("RATE_LIMITED");
    return failure("RATE_LIMITED", admission.retryAfterMs);
  }
  await ctx.db.insert("sessions", {
    hash,
    role: "guest",
    expiresAt: Date.now() + 30 * 86400000,
  });
  log("CREATED");
  return success({ reused: false });
}

export async function issueSession(
  ctx: MutationCtx,
  _args: Infer<typeof issueSessionArgs>,
): Promise<IssueSessionResult> {
  const token =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  if (!(await admitGuest(ctx)).ok) return failure("RATE_LIMITED");
  await ctx.db.insert("sessions", {
    hash: digest(token),
    role: "guest",
    expiresAt: Date.now() + 30 * 86400000,
  });
  return success({ token });
}
