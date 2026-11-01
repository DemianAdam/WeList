import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "retention cleanup",
  { hours: 1 },
  internal.maintenance.mutations.run,
  {},
);
export default crons;
