import { mutation } from "../_generated/server";
import { updateGateArgs } from "./validators";
import { updateGate as updateGateHandler } from "./model";
export const updateGate = mutation({
  args: updateGateArgs,
  handler: updateGateHandler,
});
