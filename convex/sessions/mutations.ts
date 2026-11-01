import { mutation } from "../_generated/server";
import { registerSessionArgs, issueSessionArgs } from "./validators";
import {
  registerSession as registerSessionHandler,
  issueSession as issueSessionHandler,
} from "./model";
export const registerSession = mutation({
  args: registerSessionArgs,
  handler: registerSessionHandler,
});

export const issueSession = mutation({
  args: issueSessionArgs,
  handler: issueSessionHandler,
});
