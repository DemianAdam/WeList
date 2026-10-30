import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const url = process.env.WELIST_STAGING_URL;
if (!url || !process.argv.includes("--i-understand-staging"))
  throw Error("Set WELIST_STAGING_URL and pass --i-understand-staging");
const ref = (name) => makeFunctionReference(name);
const http = new ConvexHttpClient(url);
if (!(await http.query(ref("staging:enabled"), {})))
  throw Error(
    "Refusing to run: staging load testing is not enabled on this deployment",
  );
const event = await http.query(ref("guest:current"), {});
if (
  !event ||
  event.name !== "Synthetic staging load test" ||
  event.status !== "live"
)
  throw Error("Refusing to run: expected a fresh synthetic staging event");
const summarize = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: Math.round(sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0),
    p95Ms: Math.round(sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0),
    maxMs: Math.round(sorted.at(-1) ?? 0),
  };
};
const started = performance.now();
const issued = [];
for (let batch = 0; batch < 20; batch++) {
  const batchStarted = performance.now();
  issued.push(
    ...(await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        http.mutation(ref("guest:issueSession"), {}, { skipQueue: true }),
      ),
    )),
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 500 - (performance.now() - batchStarted))),
  );
}
const tokens = issued.flatMap((r) =>
  r.status === "fulfilled" && r.value !== "RATE_LIMITED" ? [r.value] : [],
);
const reasons = {};
for (const result of issued) {
  const reason =
    result.status === "rejected"
      ? String(
          result.reason?.cause?.code ?? result.reason?.message ?? result.reason,
        ).slice(0, 200)
      : result.value === "RATE_LIMITED"
        ? "RATE_LIMITED"
        : null;
  if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
}
console.log(
  JSON.stringify({
    stage: "guest issuance",
    attempts: 500,
    burstSize: 25,
    successes: tokens.length,
    failures: 500 - tokens.length,
    reasons,
    elapsedMs: Math.round(performance.now() - started),
  }),
);
if (tokens.length < 100)
  throw Error("Fewer than 100 sessions succeeded; stopping real-time test");
const clients = Array.from(
  { length: 100 },
  () => new ConvexClient(url, { unsavedChangesWarning: false }),
);
const unsubscribes = [];
const batchStarts = Array(5).fill(null);
const observed = Array.from({ length: 100 }, () => new Set());
const arrivals = [];
const writes = [];
try {
  await Promise.all(
    clients.map(async (client, i) => {
      const args = { token: tokens[i], eventId: event._id };
      await client.mutation(ref("guest:gate"), {
        ...args,
        profile: 0,
        confirm: false,
      });
      const result = await client.mutation(ref("guest:gate"), {
        ...args,
        confirm: true,
      });
      if (result !== "OK") throw Error(`Gate failed: ${result}`);
    }),
  );
  await Promise.all(
    clients.map(
      (client, i) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Error("Subscription did not start")),
            30000,
          );
          let ready = false;
          const unsub = client.onUpdate(
            ref("guest:leaderboard"),
            { eventId: event._id, limit: 50 },
            (rows) => {
              if (!ready) {
                ready = true;
                clearTimeout(timeout);
                resolve();
              }
              const total = rows.reduce((sum, row) => sum + row.votes, 0);
              for (let batch = 0; batch < 5; batch++)
                if (
                  batchStarts[batch] !== null &&
                  total >= (batch + 1) * 20 &&
                  !observed[i].has(batch)
                ) {
                  observed[i].add(batch);
                  arrivals.push(performance.now() - batchStarts[batch]);
                }
            },
            reject,
          );
          unsubscribes.push(unsub);
        }),
    ),
  );
  let failures = 0;
  for (let batch = 0; batch < 5; batch++) {
    batchStarts[batch] = performance.now();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, async (_, j) => {
        const i = batch * 20 + j;
        const start = performance.now();
        const result = await clients[i].mutation(ref("guest:requestOrVote"), {
          token: tokens[i],
          eventId: event._id,
          trackId: `staging-song-${i % 10}`,
        });
        writes.push(performance.now() - start);
        if (result !== "OK") throw Error(result);
      }),
    );
    failures += results.filter((r) => r.status === "rejected").length;
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, 1000 - (performance.now() - batchStarts[batch])),
      ),
    );
  }
  const deadline = Date.now() + 30000;
  while (arrivals.length < 500 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  const rows = await http.query(ref("guest:leaderboard"), {
    eventId: event._id,
    limit: 50,
  });
  console.log(
    JSON.stringify({
      stage: "100 websocket clients",
      attempts: 100,
      failedMutations: failures,
      finalVotes: rows.reduce((n, row) => n + row.votes, 0),
      mutationLatency: summarize(writes),
      subscriptionLatencyFromBatchStart: summarize(arrivals),
      expectedSubscriptionObservations: 500,
    }),
  );
} finally {
  unsubscribes.forEach((fn) => fn());
  await Promise.all(clients.map((client) => client.close()));
}
