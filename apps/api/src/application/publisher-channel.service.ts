import type {
  CreatePublisherChannelBody,
  ListPublisherChannelsQuery,
  UpdatePublisherChannelBody,
} from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  assertPublisherChannelTransition,
  validatePublisherChannel,
  validatePublisherChannelStatus,
} from "../domain/publisher/channel.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { PublisherChannelRow } from "../infrastructure/db/schema.js";
import * as repo from "../infrastructure/repositories/publisher-channel.repository.js";
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";

export class PublisherChannelService {
  constructor(private readonly db: Db) {}

  async create(ctx: RequestContext, input: CreatePublisherChannelBody): Promise<PublisherChannelRow> {
    validatePublisherChannel(input);
    const actorId = this.requireActor(ctx);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      try {
        return await repo.createChannel(tx, {
          project_id: ctx.projectId,
          key: input.key,
          display_name: input.display_name,
          endpoint_ref: input.endpoint_ref ?? null,
          config: input.config ?? {},
          created_by: actorId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(`publisher channel key already exists: ${input.key}`);
        throw error;
      }
    });
  }

  async get(ctx: RequestContext, id: string): Promise<PublisherChannelRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) => repo.getChannel(tx, ctx.projectId, id));
    if (!row) throw new NotFoundError(`publisher channel ${id} not found`);
    return row;
  }

  list(ctx: RequestContext, query: ListPublisherChannelsQuery): Promise<PublisherChannelRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      repo.listChannels(tx, ctx.projectId, { status: query.status }),
    );
  }

  async update(ctx: RequestContext, id: string, input: UpdatePublisherChannelBody): Promise<PublisherChannelRow> {
    if (input.status !== undefined) validatePublisherChannelStatus(input.status);
    if (input.config !== undefined && (input.config === null || Array.isArray(input.config) || typeof input.config !== "object"))
      throw new ValidationError("publisher_channel.config must be an object");
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await repo.getChannel(tx, ctx.projectId, id);
      if (!current) throw new NotFoundError(`publisher channel ${id} not found`);
      if (input.status !== undefined)
        assertPublisherChannelTransition(current.status as "active" | "disabled" | "archived", input.status);
      const updated = await repo.updateChannel(tx, ctx.projectId, id, {
        display_name: input.display_name,
        endpoint_ref: input.endpoint_ref,
        config: input.config,
        status: input.status,
      });
      if (!updated) throw new NotFoundError(`publisher channel ${id} not found`);
      return updated;
    });
  }

  disable(ctx: RequestContext, id: string): Promise<PublisherChannelRow> {
    return this.update(ctx, id, { status: "disabled" });
  }

  archive(ctx: RequestContext, id: string): Promise<PublisherChannelRow> {
    return this.update(ctx, id, { status: "archived" });
  }

  async ensureActiveChannel(ctx: RequestContext, key: string): Promise<PublisherChannelRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) => repo.getChannelByKey(tx, ctx.projectId, key));
    if (!row) throw new NotFoundError(`publisher channel ${key} not found`);
    if (row.status !== "active") throw new ConflictError(`publisher channel ${key} is not active`);
    return row;
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("publisher channel requires an actor");
    return ctx.actorId;
  }
}
