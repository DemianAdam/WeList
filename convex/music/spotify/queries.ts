import { query } from "../../_generated/server";
import { providerStatusArgs } from "./validators";
import { providerStatus as providerStatusHandler } from "./model";
export const providerStatus = query({
  args: providerStatusArgs,
  handler: providerStatusHandler,
});
