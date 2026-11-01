import { afterEach, expect, it, vi } from "vitest";
import {
  createGuestSession,
  type RegistrationResult,
} from "../../src/data/guestSession";
import {
  classifyFailure,
  recordDiagnostic,
  applicationCode,
} from "../../shared/session-diagnostics.mjs";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    values,
  };
}
function locks() {
  let tail = Promise.resolve();
  return {
    request: <T>(_name: string, callback: () => Promise<T>): Promise<T> => {
      const next = tail.then(callback);
      tail = next.then(
        () => {},
        () => {},
      );
      return next;
    },
  };
}
const url = "https://test.convex.cloud";
const pendingKey = "welist-pending-session:test.convex.cloud";
it("clears an expired pending identity when the backend throws a structured error", async () => {
  const s = storage();
  const onExpire = vi.fn();
  const register = vi.fn(async (): Promise<RegistrationResult> => {
    throw Object.assign(Error("Expired"), {
      data: { code: "SESSION_EXPIRED" },
    });
  });
  const guest = createGuestSession({
    url,
    storage: s,
    locks: locks(),
    register,
    onExpire,
  });
  try {
    await expect(guest.ensure()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    expect(s.getItem(pendingKey)).toBeNull();
    expect(guest.getToken()).toBe("");
    expect(register).toHaveBeenCalledOnce();
    expect(onExpire).toHaveBeenCalledOnce();
  } finally {
    guest.dispose();
  }
});
function fixture(
  register = vi.fn(async (): Promise<RegistrationResult> => ({
    status: "OK",
    reused: false,
  })),
) {
  const s = storage(),
    lock = locks(),
    diagnostic = vi.fn();
  const create = () =>
    createGuestSession({
      url,
      storage: s,
      locks: lock,
      register,
      diagnostic,
      random: () => 0,
    });
  return { s, lock, diagnostic, register, create };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("includes lock waiting in the total budget and never registers after a timed-out/disposed wait", async () => {
  vi.useFakeTimers();
  const s = storage(),
    register = vi.fn(async (): Promise<RegistrationResult> => ({
      status: "OK",
      reused: false,
    }));
  let enter: () => void = () => {};
  const blocked = {
    request: <T>(_name: string, callback: () => Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        enter = () => {
          callback().then(resolve, reject);
        };
      }),
  };
  const a = createGuestSession({ url, storage: s, locks: blocked, register });
  const outcome = a.ensure().catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await outcome).toBeInstanceOf(Error);
  enter();
  await Promise.resolve();
  expect(register).not.toHaveBeenCalled();
  const b = createGuestSession({ url, storage: s, locks: blocked, register });
  const disposed = b.ensure().catch((e: Error) => e);
  b.dispose();
  expect(await disposed).toBeInstanceOf(Error);
  enter();
  await Promise.resolve();
  expect(register).not.toHaveBeenCalled();
});

it("shares registration within and across adapters without duplicating identities", async () => {
  const f = fixture(),
    a = f.create(),
    b = f.create();
  await Promise.all([a.ensure(), a.ensure(), b.ensure()]);
  expect(f.register).toHaveBeenCalledOnce();
  expect(a.getToken()).toBe(b.getToken());
  expect(a.getToken()).toMatch(/^[a-f0-9]{64}$/);
  expect(f.s.getItem(pendingKey)).toBeNull();
});

it("keeps one persisted identity through lost responses and reloads", async () => {
  const register = vi.fn(async (): Promise<RegistrationResult> => {
    throw new Error("unclassified failure");
  });
  const f = fixture(register),
    a = f.create();
  await expect(a.ensure()).rejects.toThrow("No pudimos conectar");
  const pending = f.s.getItem(pendingKey);
  a.dispose();
  register.mockResolvedValue({ status: "OK", reused: true });
  const b = f.create();
  await b.ensure();
  expect(register.mock.calls[0]).toEqual(register.mock.calls[1]);
  expect(b.getToken()).toBe(JSON.parse(pending!).bootstrapToken);
});

it("retries transient failures with the same credential, within three attempts", async () => {
  const register = vi.fn(async (): Promise<RegistrationResult> => {
    throw new TypeError("fetch failed");
  });
  const f = fixture(register),
    a = f.create();
  await expect(a.ensure()).rejects.toThrow("No pudimos conectar");
  expect(register).toHaveBeenCalledTimes(3);
  expect(register.mock.calls[0]).toEqual(register.mock.calls[2]);
  expect(f.diagnostic.mock.calls.map(([e]) => e.outcome)).toEqual([
    "NETWORK_ERROR",
    "NETWORK_ERROR",
    "NETWORK_ERROR",
  ]);
});

it("applies retry jitter and never retries typed validation/configuration errors", async () => {
  vi.useFakeTimers();
  const s = storage(),
    lock = locks();
  const transient = vi.fn(async (): Promise<RegistrationResult> => {
    throw new TypeError("fetch failed");
  });
  const manager = createGuestSession({
    url,
    storage: s,
    locks: lock,
    register: transient,
    random: () => 1,
    diagnostic: () => {},
  });
  const done = manager.ensure().catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(249);
  expect(transient).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2);
  expect(transient).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(750);
  expect(await done).toBeInstanceOf(Error);
  expect(transient).toHaveBeenCalledTimes(3);
  for (const data of ["VALIDATION_ERROR", "CONFIGURATION_ERROR"]) {
    const typed = fixture(
      vi.fn(async (): Promise<RegistrationResult> => {
        throw Object.assign(new Error("Private backend details"), { data });
      }),
    );
    await expect(typed.create().ensure()).rejects.toThrow(
      "No pudimos conectar",
    );
    expect(typed.register).toHaveBeenCalledOnce();
  }
});

it("requires a new action after explicit expiry and does not overwrite malformed pending data", async () => {
  const f = fixture(
    vi.fn(async (): Promise<RegistrationResult> => ({
      status: "SESSION_EXPIRED",
    })),
  );
  await expect(f.create().ensure()).rejects.toMatchObject({
    code: "SESSION_EXPIRED",
  });
  expect(f.register).toHaveBeenCalledOnce();
  expect(f.s.getItem(pendingKey)).toBeNull();
  f.s.setItem(pendingKey, "broken-json");
  await expect(f.create().ensure()).rejects.toThrow();
  expect(f.s.getItem(pendingKey)).toBe("broken-json");
  expect(f.register).toHaveBeenCalledOnce();
});

it("times out uncertain requests, ignores late completions, and preserves pending identity", async () => {
  vi.useFakeTimers();
  let late: (value: RegistrationResult) => void = () => {};
  const register = vi.fn(
    () =>
      new Promise<RegistrationResult>((resolve) => {
        late = resolve;
      }),
  );
  const f = fixture(register),
    a = f.create();
  const outcome = a.ensure().catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await outcome).toBeInstanceOf(Error);
  expect(register).toHaveBeenCalledTimes(3);
  late({ status: "OK", reused: false });
  await Promise.resolve();
  expect(a.getToken()).toBe("");
  expect(f.s.getItem(pendingKey)).toBeTruthy();
  expect(f.s.getItem("welist-token")).toBeNull();
});

it("respects retry-after, does not retry terminal errors, and aborts on disposal", async () => {
  vi.useFakeTimers();
  const register = vi.fn(async (): Promise<RegistrationResult> => ({
    status: "RATE_LIMITED",
    retryAfterMs: 2000,
  }));
  const f = fixture(register),
    a = f.create();
  const result = a.ensure().catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(1999);
  expect(register).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2);
  expect(register).toHaveBeenCalledTimes(2);
  a.dispose();
  await vi.runAllTimersAsync();
  expect(await result).toBeInstanceOf(Error);
  expect(register).toHaveBeenCalledTimes(2);
  const blocked = fixture(
    vi.fn(async (): Promise<RegistrationResult> => ({
      status: "RATE_LIMITED",
      retryAfterMs: 60000,
    })),
  );
  await expect(blocked.create().ensure()).rejects.toThrow();
  expect(blocked.register).toHaveBeenCalledOnce();
});

it("fails before registering when storage cannot persist and retains data if confirmation storage fails", async () => {
  const f = fixture();
  const original = f.s.setItem;
  f.s.setItem = () => {
    throw new Error("Storage failed");
  };
  await expect(f.create().ensure()).rejects.toThrow();
  expect(f.register).not.toHaveBeenCalled();
  f.s.setItem = (key, value) => {
    if (key === "welist-token") throw new Error("Storage failed");
    original(key, value);
  };
  await expect(f.create().ensure()).rejects.toThrow();
  expect(f.s.getItem(pendingKey)).toBeTruthy();
});

it("reuses existing credentials; explicit expiration clears them without registering again", () => {
  const f = fixture();
  f.s.setItem("welist-token", "existing-legacy-token");
  const a = f.create();
  expect(a.getToken()).toBe("existing-legacy-token");
  a.invalidate("different");
  expect(a.getToken()).toBe("existing-legacy-token");
  a.invalidate("existing-legacy-token");
  expect(a.getToken()).toBe("");
  expect(f.s.getItem("welist-token")).toBeNull();
  expect(f.register).not.toHaveBeenCalled();
});

it("classifies only supported signatures and strips secrets from diagnostic events", () => {
  expect(classifyFailure({ data: "CONFIGURATION_ERROR" })).toBe(
    "CONFIGURATION_ERROR",
  );
  expect(
    classifyFailure({ message: "OptimisticConcurrencyControlFailure" }),
  ).toBe("WRITE_CONFLICT");
  expect(classifyFailure({ message: "Please retry the database later" })).toBe(
    "UNKNOWN",
  );
  expect(applicationCode({ data: "SESSION_EXPIRED" })).toBe("SESSION_EXPIRED");
  const sink = vi.fn();
  recordDiagnostic(sink, {
    operationId: crypto.randomUUID(),
    attempt: 1,
    outcome: "UNKNOWN",
    elapsedMs: 1,
    ...{ token: "secret", hash: "hash", message: "password" },
  });
  expect(JSON.stringify(sink.mock.calls)).not.toMatch(/secret|hash|password/);
});
