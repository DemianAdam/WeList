import { query } from "../_generated/server";
import { leaderboardArgs } from "./validators";
import { leaderboard as leaderboardHandler } from "./model";
export const leaderboard = query({
  args: leaderboardArgs,
  handler: leaderboardHandler,
});
