import { mutation } from "../_generated/server";
import { startEventArgs, endEventArgs } from "./validators";
import {
  startEvent as startEventHandler,
  endEvent as endEventHandler,
} from "./model";
export const startEvent = mutation({
  args: startEventArgs,
  handler: startEventHandler,
});

export const endEvent = mutation({
  args: endEventArgs,
  handler: endEventHandler,
});
