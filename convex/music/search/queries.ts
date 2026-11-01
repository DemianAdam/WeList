import { internalQuery } from "../../_generated/server";
import {
  cachedSongSearchArgs,
  visibleProviderTracksArgs,
  localSearchArgs,
} from "./validators";
import {
  cachedSongSearch as cachedSongSearchHandler,
  visibleProviderTracks as visibleProviderTracksHandler,
  localSearch as localSearchHandler,
} from "./lookup";
export const cachedSongSearch = internalQuery({
  args: cachedSongSearchArgs,
  handler: cachedSongSearchHandler,
});

export const visibleProviderTracks = internalQuery({
  args: visibleProviderTracksArgs,
  handler: visibleProviderTracksHandler,
});

export const localSearch = internalQuery({
  args: localSearchArgs,
  handler: localSearchHandler,
});
