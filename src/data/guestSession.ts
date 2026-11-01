import {
  applicationCode,
  classifyFailure,
  platformRequestId,
  recordDiagnostic,
  type RegistrationDiagnostic,
} from "../../shared/session-diagnostics.mjs";
import { CommandError } from "./types";

export type RegistrationResult =
  | { status: "OK"; reused: boolean }
  | { status: "RATE_LIMITED"; retryAfterMs: number }
  | { status: "SESSION_EXPIRED" };
type Pending = { bootstrapToken: string; operationId: string };
type Locks = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
};
const RETRY_MESSAGE = "No pudimos conectar. Vuelve a intentarlo.";
const expired = () =>
  new CommandError("SESSION_EXPIRED", "Tu sesión venció. Vuelve a participar.");

function waitFor<T>(
  promise: Promise<T>,
  ms: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (error !== undefined) reject(error);
      else resolve(value as T);
    };
    const cancel = () => finish(signal.reason ?? new Error("Disposed"));
    const timer = setTimeout(
      () => finish(Object.assign(new Error("Timeout"), { code: "TIMEOUT" })),
      ms,
    );
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    promise.then(
      (value) => finish(undefined, value),
      (error: unknown) => finish(error),
    );
  });
}

export function createGuestSession(options: {
  url: string;
  register: (args: Pending) => Promise<RegistrationResult>;
  onReady?: () => void;
  onExpire?: () => void;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  locks?: Locks;
  diagnostic?: (event: RegistrationDiagnostic) => void;
  now?: () => number;
  random?: () => number;
}) {
  const storage = options.storage ?? localStorage;
  const locks = options.locks ?? {
    request: <T>(name: string, callback: () => Promise<T>) =>
      navigator.locks.request(name, callback),
  };
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const pendingKey = `welist-pending-session:${new URL(options.url).host}`;
  const lockName = `welist-guest-session:${new URL(options.url).host}`;
  let token = "";
  try {
    token = storage.getItem("welist-token") ?? "";
  } catch {
    /* Fail safely when ensuring the session. */
  }
  let disposed = false;
  let inFlight: Promise<void> | null = null;
  let controller = new AbortController();
  const diagnostic =
    options.diagnostic ?? ((event) => console.info(JSON.stringify(event)));

  function invalidate(expectedToken: string) {
    if (!expectedToken || token !== expectedToken || disposed) return;
    try {
      if (storage.getItem("welist-token") === expectedToken)
        storage.removeItem("welist-token");
      const pending = JSON.parse(storage.getItem(pendingKey) ?? "null");
      if (pending?.bootstrapToken === expectedToken)
        storage.removeItem(pendingKey);
    } catch {
      /* Preserve malformed/unknown pending data rather than minting another identity. */
    }
    token = "";
    controller.abort(expired());
    controller = new AbortController();
    options.onExpire?.();
  }

  async function register() {
    if (disposed) throw new Error(RETRY_MESSAGE);
    const signal = controller.signal;
    const started = now();
    let active = true;
    try {
      const work = locks.request(lockName, async () => {
        if (!active || disposed || signal.aborted)
          throw signal.reason ?? new Error(RETRY_MESSAGE);
        const confirmed = storage.getItem("welist-token");
        if (confirmed) {
          token = confirmed;
          return;
        }
        let pending: Pending | null = JSON.parse(
          storage.getItem(pendingKey) ?? "null",
        );
        if (
          !pending ||
          !/^[a-f0-9]{64}$/.test(pending.bootstrapToken) ||
          !/^[a-f0-9-]{36}$/i.test(pending.operationId)
        ) {
          if (pending) throw new Error(RETRY_MESSAGE);
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          pending = {
            bootstrapToken: Array.from(bytes, (b) =>
              b.toString(16).padStart(2, "0"),
            ).join(""),
            operationId: crypto.randomUUID(),
          };
          storage.setItem(pendingKey, JSON.stringify(pending));
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (!active || disposed || signal.aborted)
            throw signal.reason ?? new Error(RETRY_MESSAGE);
          const remaining = 10000 - (now() - started);
          if (remaining <= 0) break;
          let delay = 0;
          const attemptStart = now();
          try {
            const result = await waitFor(
              options.register(pending),
              Math.min(3000, remaining),
              signal,
            );
            if (!active || disposed || signal.aborted)
              throw signal.reason ?? new Error(RETRY_MESSAGE);
            recordDiagnostic(diagnostic, {
              operationId: pending.operationId,
              attempt,
              elapsedMs: now() - attemptStart,
              outcome:
                result.status === "OK"
                  ? result.reused
                    ? "REUSED"
                    : "OK"
                  : result.status,
            });
            if (result.status === "OK") {
              storage.setItem("welist-token", pending.bootstrapToken);
              token = pending.bootstrapToken;
              storage.removeItem(pendingKey);
              options.onReady?.();
              return;
            }
            if (result.status === "SESSION_EXPIRED") {
              storage.removeItem(pendingKey);
              options.onExpire?.();
              throw expired();
            }
            delay = Math.max(1, result.retryAfterMs) + random() * 250;
          } catch (error) {
            if (
              !active ||
              disposed ||
              signal.aborted ||
              applicationCode(error) === "SESSION_EXPIRED" ||
              (error instanceof CommandError &&
                error.code === "SESSION_EXPIRED")
            )
              throw error;
            const category = classifyFailure(error);
            recordDiagnostic(diagnostic, {
              operationId: pending.operationId,
              attempt,
              elapsedMs: now() - attemptStart,
              outcome: category,
              requestId: platformRequestId(error),
            });
            if (
              !["NETWORK_ERROR", "TIMEOUT", "WRITE_CONFLICT"].includes(category)
            )
              throw new Error(RETRY_MESSAGE);
            delay = random() * (attempt === 1 ? 250 : 750);
          }
          if (attempt === 3 || now() - started + delay >= 10000) break;
          await waitFor(
            new Promise<void>((resolve) => setTimeout(resolve, delay)),
            Math.min(10000 - (now() - started), delay + 100),
            signal,
          );
        }
        throw new Error(RETRY_MESSAGE);
      });
      await waitFor(work, 10000, signal);
    } finally {
      active = false;
    }
  }

  return {
    getToken: () => token,
    ensure: () => {
      if (disposed) return Promise.reject(new Error(RETRY_MESSAGE));
      if (token) return Promise.resolve();
      inFlight ??= register()
        .catch((error: unknown) => {
          if (error instanceof CommandError) throw error;
          throw new Error(RETRY_MESSAGE);
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    invalidate,
    dispose: () => {
      disposed = true;
      controller.abort(new Error(RETRY_MESSAGE));
    },
  };
}
