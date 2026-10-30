# Staging results — 30 October 2026

The test ran against a temporary, isolated Convex development deployment using synthetic event and track data. It did not call Spotify or modify the existing development or production deployments.

| Exercise                                                          | Result                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before limiter sharding: 500 simultaneous session requests        | 141 succeeded; 359 failed. A second run had 147 successes and 353 optimistic concurrency conflicts on `limits`.                                                                       |
| After sharding: 500 simultaneous session requests                 | 474 succeeded; 26 failed with client-side `fetch failed` errors. The cause of these network failures was not established.                                                             |
| After sharding: 500 session requests in 20 concurrent waves of 25 | 500 succeeded, none failed; elapsed 10.16 seconds.                                                                                                                                    |
| 100 WebSocket clients, 20 attempted votes per second              | 100 votes recorded, no failed mutations. Mutation latency: p50 261 ms, p95 382 ms, max 405 ms.                                                                                        |
| Subscription delivery                                             | All 500 client/batch observations arrived. Latency from batch submission: p50 382 ms, p95 405 ms, max 408 ms. This includes mutation processing and is not measured from commit time. |
| Synthetic DJ account                                              | Provisioning, login, token refresh, authenticated dashboard access and unauthenticated rejection passed.                                                                              |

These are single-run observations, not production capacity guarantees. The 500-at-once network failures warrant further investigation before claiming support for an instantaneous burst. Physical iOS/Android Instagram switching, a publicly hosted QR, real Spotify access and a full browser-based cloud DJ flow were not validated. The staging load-test flag and temporary deployment key were removed after testing; the deployment is configured to expire after four days.
