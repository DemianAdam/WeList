import { internalMutation } from "../_generated/server";
import { eventCacheArgs, runArgs } from "./validators";
import { eventCache as eventCacheHandler, run as runHandler } from "./model";
export const eventCache = internalMutation({
  args: eventCacheArgs,
  handler: eventCacheHandler,
});

export const run = internalMutation({ args: runArgs, handler: runHandler });
