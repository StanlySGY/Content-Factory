import type { CreatePublishRecordBody, ListPublishRecordsQuery } from "@cf/shared";
import { validateCreatePublishRecord } from "../domain/publisher/publish-record.js";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { Db } from "../infrastructure/db/client.js";
import type { PublishRecordRow } from "../infrastructure/db/schema.js";
import * as repo from "../infrastructure/repositories/publish-record.repository.js";
import type { PublisherChannelService } from "./publisher-channel.service.js";
import type { RequestContext } from "./task.service.js";

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string }).code === "23505";
}

export class PublishRecordService {
  constructor(private readonly db: Db, private readonly publisherChannelService?: PublisherChannelService) {}

  async create(ctx: RequestContext, input: CreatePublishRecordBody): Promise<PublishRecordRow> {
    validateCreatePublishRecord(input);
    await this.publisherChannelService?.ensureActiveChannel(ctx, input.channel);
    try {
      return await repo.createPublishRecord(this.db, {
        content_task_id: input.content_task_id,
        content_asset_id: input.content_asset_id,
        asset_version_id: input.asset_version_id,
        channel: input.channel,
        idempotency_key: input.idempotency_key,
        metadata: input.metadata ?? {},
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictError(`publish_record idempotency_key already exists: ${input.idempotency_key}`);
      }
      throw e;
    }
  }

  async get(id: string): Promise<PublishRecordRow> {
    const row = await repo.getPublishRecord(this.db, id);
    if (!row) throw new NotFoundError(`publish_record ${id} not found`);
    return row;
  }

  list(query: ListPublishRecordsQuery): Promise<PublishRecordRow[]> {
    return repo.listPublishRecords(this.db, {
      task_id: query.task_id,
      status: query.status,
      channel: query.channel,
    });
  }
}
