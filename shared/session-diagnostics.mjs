const categories = new Set([
  "RATE_LIMITED",
  "WRITE_CONFLICT",
  "NETWORK_ERROR",
  "TIMEOUT",
  "VALIDATION_ERROR",
  "CONFIGURATION_ERROR",
  "UNKNOWN",
]);
export function applicationCode(error) {
  const data = error?.data;
  return typeof data === "string"
    ? data
    : typeof data?.code === "string"
      ? data.code
      : undefined;
}
export function classifyFailure(error) {
  const code = applicationCode(error) ?? error?.code;
  if (categories.has(code)) return code;
  const message = typeof error?.message === "string" ? error.message : "";
  if (
    /OptimisticConcurrencyControlFailure|Documents read from or written to the table .* changed while this mutation was being run/.test(
      message,
    )
  )
    return "WRITE_CONFLICT";
  if (
    /^(Failed to fetch|fetch failed|Load failed|NetworkError when attempting to fetch resource\.)$/.test(
      message,
    ) ||
    [
      "ECONNRESET",
      "ENOTFOUND",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
    ].includes(error?.cause?.code)
  )
    return "NETWORK_ERROR";
  return "UNKNOWN";
}
export function platformRequestId(error) {
  return typeof error?.message === "string"
    ? error.message.match(/\[Request ID: ([a-f0-9]{8,64})\]/i)?.[1]
    : undefined;
}
export function recordDiagnostic(sink, event) {
  const safe = {
    event: "guest_registration",
    operationId: /^[a-f0-9-]{36}$/i.test(event.operationId)
      ? event.operationId
      : "invalid",
    attempt: Number.isSafeInteger(event.attempt) ? event.attempt : 0,
    outcome:
      categories.has(event.outcome) ||
      ["OK", "REUSED", "SESSION_EXPIRED", "DISPOSED"].includes(event.outcome)
        ? event.outcome
        : "UNKNOWN",
    elapsedMs: Number.isFinite(event.elapsedMs)
      ? Math.max(0, Math.round(event.elapsedMs))
      : 0,
  };
  if (/^[a-f0-9]{8,64}$/i.test(event.requestId ?? ""))
    safe.requestId = event.requestId;
  try {
    sink(safe);
  } catch {
    /* Diagnostics must not alter registration. */
  }
  return safe;
}
