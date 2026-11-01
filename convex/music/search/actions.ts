"use node";
import { action } from "../../_generated/server";
import { localActionArgs, searchArgs } from "./validators";
import {
  localSearch as localSearchHandler,
  search as searchHandler,
} from "./orchestrator.node";
export const localSearch = action({
  args: localActionArgs,
  handler: localSearchHandler,
});

export const search = action({ args: searchArgs, handler: searchHandler });
