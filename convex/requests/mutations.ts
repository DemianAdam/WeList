import { mutation } from "../_generated/server";
import { requestOrVoteArgs, setArchivedArgs } from "./validators";
import {
  requestOrVote as requestOrVoteHandler,
  setArchived as setArchivedHandler,
} from "./model";
export const requestOrVote = mutation({
  args: requestOrVoteArgs,
  handler: requestOrVoteHandler,
});

export const setArchived = mutation({
  args: setArchivedArgs,
  handler: setArchivedHandler,
});
