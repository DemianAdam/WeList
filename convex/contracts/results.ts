/** Expected business outcomes. Access and validation failures use ConvexError. */
export type Result<T, Code extends string> =
  | { ok: true; data: T }
  | { ok: false; error: { code: Code; retryAfterMs?: number } };
export const success = <T>(data: T): { ok: true; data: T } => ({
  ok: true,
  data,
});
export const failure = <Code extends string>(
  code: Code,
  retryAfterMs?: number,
): { ok: false; error: { code: Code; retryAfterMs?: number } } => ({
  ok: false,
  error: { code, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) },
});
