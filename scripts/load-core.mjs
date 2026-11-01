import {
  classifyFailure,
  platformRequestId,
  recordDiagnostic,
} from "../shared/session-diagnostics.mjs";
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Launch independently of completion; callers settle their own operations.
export async function paceBatches(
  count,
  intervalMs,
  launch,
  { now = () => performance.now(), wait = sleep } = {},
) {
  const started = now();
  for (let i = 0; i < count; i++) {
    await wait(Math.max(0, started + i * intervalMs - now()));
    launch(i, now() - started);
  }
}
export async function bounded(operation, ms = 30000, label = "operation") {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(Error(`${label}: timeout`), { code: "TIMEOUT" }),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function assertStaging(enabled, event) {
  if (enabled !== true) throw Error("Staging load testing is disabled");
  if (event?.name !== "Synthetic staging load test" || event.status !== "live")
    throw Error("Expected a live synthetic staging event");
}
export function summarize(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const percentile = (p) =>
    sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return {
    count: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}
export async function measure(
  records,
  kind,
  operation,
  ms = 30000,
  context = {},
) {
  // Only allow non-secret diagnostic metadata, never spread request arguments.
  const start = performance.now();
  const diagnostic = (outcome, error) =>
    context.operationId
      ? recordDiagnostic(() => {}, {
          operationId: context.operationId,
          attempt: context.attempt,
          outcome,
          elapsedMs: performance.now() - start,
          requestId: platformRequestId(error),
        })
      : {};
  try {
    const value = await bounded(operation, ms, kind);
    records.push({
      kind,
      ok: true,
      ms: performance.now() - start,
      ...diagnostic(value?.status === "OK" && value.reused ? "REUSED" : "OK"),
    });
    return value;
  } catch (error) {
    // Exception messages can contain credentials; retain only a safe category.
    records.push({
      kind,
      ok: false,
      ms: performance.now() - start,
      error: classifyFailure(error),
      ...diagnostic(classifyFailure(error), error),
      ...(platformRequestId(error)
        ? { requestId: platformRequestId(error) }
        : {}),
      ...(error?.expectedInjection === true ? { expectedInjection: true } : {}),
    });
    throw error;
  }
}
export function requireOk(value) {
  if (value !== "OK")
    throw Object.assign(Error("Mutation rejected"), { data: value });
  return value;
}
export function evaluate(result, { latencyMs = 2000, deliveryMs = 2000 } = {}) {
  const failures = [];
  if (
    result.records.some(
      (r) =>
        !r.ok &&
        !(result.scenario === "recovery" && r.expectedInjection === true),
    )
  )
    failures.push("Unexpected operation failures");
  if (result.sessionSuccesses !== result.expectedSessions)
    failures.push("Missing sessions");
  for (const kind of ["session", "vote", "gate"]) {
    if (
      summarize(
        result.records.filter((r) => r.kind === kind && r.ok).map((r) => r.ms),
      ).p95Ms > latencyMs
    )
      failures.push(`${kind} p95 exceeds ${latencyMs}ms`);
  }
  if (
    result.expectedVotes !== undefined &&
    result.finalVotes !== result.expectedVotes
  )
    failures.push("Incorrect final vote total");
  if (
    result.expectedObservations !== undefined &&
    result.arrivals.length !== result.expectedObservations
  )
    failures.push("Missing subscription observations");
  if (result.arrivals?.some((ms) => ms > 30000))
    failures.push("Subscription exceeded 30 second deadline");
  if (result.arrivals?.length && summarize(result.arrivals).p95Ms > deliveryMs)
    failures.push(`Subscription p95 exceeds ${deliveryMs}ms`);
  if (result.subscriptionErrors) failures.push("Subscription errors");
  return failures;
}
export function observeCheckpoints(
  checkpoints,
  observed,
  total,
  now,
  arrivals,
) {
  checkpoints.forEach((checkpoint, index) => {
    if (total >= checkpoint.total && !observed.has(index)) {
      observed.add(index);
      arrivals.push(now - checkpoint.started);
    }
  });
}
