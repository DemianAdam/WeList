/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as contracts_commands from "../contracts/commands.js";
import type * as contracts_music from "../contracts/music.js";
import type * as contracts_results from "../contracts/results.js";
import type * as crons from "../crons.js";
import type * as events_access from "../events/access.js";
import type * as events_model from "../events/model.js";
import type * as events_mutations from "../events/mutations.js";
import type * as events_queries from "../events/queries.js";
import type * as events_tables from "../events/tables.js";
import type * as events_validators from "../events/validators.js";
import type * as http from "../http.js";
import type * as maintenance_model from "../maintenance/model.js";
import type * as maintenance_mutations from "../maintenance/mutations.js";
import type * as maintenance_validators from "../maintenance/validators.js";
import type * as music_search_actions from "../music/search/actions.js";
import type * as music_search_admission from "../music/search/admission.js";
import type * as music_search_cache from "../music/search/cache.js";
import type * as music_search_leases from "../music/search/leases.js";
import type * as music_search_lookup from "../music/search/lookup.js";
import type * as music_search_mutations from "../music/search/mutations.js";
import type * as music_search_normalization from "../music/search/normalization.js";
import type * as music_search_queries from "../music/search/queries.js";
import type * as music_search_tables from "../music/search/tables.js";
import type * as music_search_validators from "../music/search/validators.js";
import type * as music_spotify_model from "../music/spotify/model.js";
import type * as music_spotify_mutations from "../music/spotify/mutations.js";
import type * as music_spotify_queries from "../music/spotify/queries.js";
import type * as music_spotify_tables from "../music/spotify/tables.js";
import type * as music_spotify_validators from "../music/spotify/validators.js";
import type * as music_validators from "../music/validators.js";
import type * as operations_provision from "../operations/provision.js";
import type * as operations_provisioning from "../operations/provisioning.js";
import type * as operations_staging from "../operations/staging.js";
import type * as operations_stagingFixtures from "../operations/stagingFixtures.js";
import type * as operations_tables from "../operations/tables.js";
import type * as participation_model from "../participation/model.js";
import type * as participation_mutations from "../participation/mutations.js";
import type * as participation_queries from "../participation/queries.js";
import type * as participation_tables from "../participation/tables.js";
import type * as participation_validators from "../participation/validators.js";
import type * as platform_authorization from "../platform/authorization.js";
import type * as platform_hashing from "../platform/hashing.js";
import type * as platform_rateLimits from "../platform/rateLimits.js";
import type * as platform_tables from "../platform/tables.js";
import type * as requests_model from "../requests/model.js";
import type * as requests_mutations from "../requests/mutations.js";
import type * as requests_queries from "../requests/queries.js";
import type * as requests_tables from "../requests/tables.js";
import type * as requests_validators from "../requests/validators.js";
import type * as sessions_access from "../sessions/access.js";
import type * as sessions_admission from "../sessions/admission.js";
import type * as sessions_model from "../sessions/model.js";
import type * as sessions_mutations from "../sessions/mutations.js";
import type * as sessions_tables from "../sessions/tables.js";
import type * as sessions_validators from "../sessions/validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "contracts/commands": typeof contracts_commands;
  "contracts/music": typeof contracts_music;
  "contracts/results": typeof contracts_results;
  crons: typeof crons;
  "events/access": typeof events_access;
  "events/model": typeof events_model;
  "events/mutations": typeof events_mutations;
  "events/queries": typeof events_queries;
  "events/tables": typeof events_tables;
  "events/validators": typeof events_validators;
  http: typeof http;
  "maintenance/model": typeof maintenance_model;
  "maintenance/mutations": typeof maintenance_mutations;
  "maintenance/validators": typeof maintenance_validators;
  "music/search/actions": typeof music_search_actions;
  "music/search/admission": typeof music_search_admission;
  "music/search/cache": typeof music_search_cache;
  "music/search/leases": typeof music_search_leases;
  "music/search/lookup": typeof music_search_lookup;
  "music/search/mutations": typeof music_search_mutations;
  "music/search/normalization": typeof music_search_normalization;
  "music/search/queries": typeof music_search_queries;
  "music/search/tables": typeof music_search_tables;
  "music/search/validators": typeof music_search_validators;
  "music/spotify/model": typeof music_spotify_model;
  "music/spotify/mutations": typeof music_spotify_mutations;
  "music/spotify/queries": typeof music_spotify_queries;
  "music/spotify/tables": typeof music_spotify_tables;
  "music/spotify/validators": typeof music_spotify_validators;
  "music/validators": typeof music_validators;
  "operations/provision": typeof operations_provision;
  "operations/provisioning": typeof operations_provisioning;
  "operations/staging": typeof operations_staging;
  "operations/stagingFixtures": typeof operations_stagingFixtures;
  "operations/tables": typeof operations_tables;
  "participation/model": typeof participation_model;
  "participation/mutations": typeof participation_mutations;
  "participation/queries": typeof participation_queries;
  "participation/tables": typeof participation_tables;
  "participation/validators": typeof participation_validators;
  "platform/authorization": typeof platform_authorization;
  "platform/hashing": typeof platform_hashing;
  "platform/rateLimits": typeof platform_rateLimits;
  "platform/tables": typeof platform_tables;
  "requests/model": typeof requests_model;
  "requests/mutations": typeof requests_mutations;
  "requests/queries": typeof requests_queries;
  "requests/tables": typeof requests_tables;
  "requests/validators": typeof requests_validators;
  "sessions/access": typeof sessions_access;
  "sessions/admission": typeof sessions_admission;
  "sessions/model": typeof sessions_model;
  "sessions/mutations": typeof sessions_mutations;
  "sessions/tables": typeof sessions_tables;
  "sessions/validators": typeof sessions_validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
