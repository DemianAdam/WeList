export type FailureCategory =
  | "RATE_LIMITED"
  | "WRITE_CONFLICT"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";
export type RegistrationDiagnostic = {
  event?: string;
  operationId: string;
  attempt: number;
  outcome: FailureCategory | "OK" | "REUSED" | "SESSION_EXPIRED" | "DISPOSED";
  elapsedMs: number;
  requestId?: string;
};
export function applicationCode(error: unknown): string | undefined;
export function classifyFailure(error: unknown): FailureCategory;
export function platformRequestId(error: unknown): string | undefined;
export function recordDiagnostic(
  sink: (event: RegistrationDiagnostic) => void,
  event: RegistrationDiagnostic,
): RegistrationDiagnostic;
