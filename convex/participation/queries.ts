import { query } from "../_generated/server";
import { participationArgs } from "./validators";
import { participation as participationHandler } from "./model";
export const participation = query({
  args: participationArgs,
  handler: participationHandler,
});
