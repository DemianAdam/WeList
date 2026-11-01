import { query } from "../_generated/server";
import { currentEventArgs, dashboardArgs } from "./validators";
import {
  currentEvent as currentEventHandler,
  dashboard as dashboardHandler,
} from "./model";
export const currentEvent = query({
  args: currentEventArgs,
  handler: currentEventHandler,
});

export const dashboard = query({
  args: dashboardArgs,
  handler: dashboardHandler,
});
