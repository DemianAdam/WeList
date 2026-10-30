import { cronJobs } from "convex/server";
import { anyApi } from "convex/server";
const crons = cronJobs();
crons.interval("retention cleanup", { hours: 1 }, anyApi.cleanup.run, {});
export default crons;
