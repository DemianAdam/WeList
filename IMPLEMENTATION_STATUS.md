# Implementation status

The demo and cloud source are present. Start the demo with `npm run dev`; its DJ password is `welist-demo`. See `docs/SETUP.md` for cloud configuration and DJ account provisioning.

DJ signup is closed, administration requires the explicitly provisioned Convex Auth user, guest-session issuance has a configurable global ceiling, and catalog searches use a temporary shared cache with concurrent-request coordination. The demo and cloud both support one or two Instagram profiles.

Before a venue pilot, verify Spotify eligibility for the intended use, deploy and provision the intended Convex environment, and test physical devices, connectivity, provider behavior, and an actual 500-session arrival burst in staging. Emulator tests do not establish production throughput or policy eligibility.
