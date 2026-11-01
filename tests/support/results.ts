import { expect } from "vitest";
import type { Result } from "../../convex/contracts/results";
export function expectData<T>(result: Result<T, string>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error.code);
  return result.data;
}
