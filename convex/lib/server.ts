import {
  queryGeneric,
  mutationGeneric,
  actionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  internalActionGeneric,
} from "convex/server";
import type {
  DataModelFromSchemaDefinition,
  QueryBuilder,
  MutationBuilder,
  ActionBuilder,
  GenericQueryCtx,
  GenericMutationCtx,
} from "convex/server";
import schema from "../schema";
export type Model = DataModelFromSchemaDefinition<typeof schema>;
export const query = queryGeneric as QueryBuilder<Model, "public">;
export const mutation = mutationGeneric as MutationBuilder<Model, "public">;
export const action = actionGeneric as ActionBuilder<Model, "public">;
export const internalMutation = internalMutationGeneric as MutationBuilder<
  Model,
  "internal"
>;
export const internalQuery = internalQueryGeneric as QueryBuilder<
  Model,
  "internal"
>;
export const internalAction = internalActionGeneric as ActionBuilder<
  Model,
  "internal"
>;
export type QueryCtx = GenericQueryCtx<Model>;
export type MutationCtx = GenericMutationCtx<Model>;
