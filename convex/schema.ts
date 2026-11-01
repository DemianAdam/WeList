import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { tables as operations } from "./operations/tables";
import { tables as events } from "./events/tables";
import { tables as sessions } from "./sessions/tables";
import { tables as participation } from "./participation/tables";
import { tables as requests } from "./requests/tables";
import { tables as music_search } from "./music/search/tables";
import { tables as platform } from "./platform/tables";
import { tables as music_spotify } from "./music/spotify/tables";
export default defineSchema({
  ...authTables,
  ...operations,
  ...events,
  ...sessions,
  ...participation,
  ...requests,
  ...music_search,
  ...platform,
  ...music_spotify,
});
