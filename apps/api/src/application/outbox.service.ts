import { NotFoundError } from "../domain/errors.js";
import type { Db } from "../infrastructure/db/client.js";
import type { OutboxEventRow } from "../infrastructure/db/schema.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";

// OutboxService：出箱事件只读观测面（list/get/按 job 聚合查询）。不写、不消费、不 join 业务表。
export class OutboxService {
  constructor(private readonly db: Db) {}

  listEvents(filter: outboxRepo.OutboxEventFilter): Promise<OutboxEventRow[]> {
    return outboxRepo.listOutboxEvents(this.db, filter);
  }

  async getEvent(id: string): Promise<OutboxEventRow> {
    const row = await outboxRepo.getOutboxEvent(this.db, id);
    if (!row) throw new NotFoundError(`outbox_event ${id} not found`);
    return row;
  }

  /** 某 execution_job 的全部出箱事件（仅按 aggregate_id 查询 outbox_events）*/
  jobEvents(jobId: string): Promise<OutboxEventRow[]> {
    return outboxRepo.listOutboxEventsByAggregateId(this.db, jobId);
  }
}
