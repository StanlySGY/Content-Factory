import type { CreateExecutionJobBody } from "@cf/shared";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { validateExecutionJob } from "../domain/execution/job.js";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string }).code === "23505";
}

// ExecutionJobService：执行作业控制面（独立体系，无 project 上下文、不耦合控制平面审计）。
// create：校验（Domain）→ 同事务写 job + outbox（出箱待 Phase 2 消费）；幂等键冲突 → 409。
export class ExecutionJobService {
  constructor(private readonly db: Db) {}

  async createJob(input: CreateExecutionJobBody): Promise<ExecutionJobRow> {
    validateExecutionJob({ type: input.type, payload: input.payload, idempotencyKey: input.idempotency_key });
    try {
      return await this.db.transaction(async (tx) => {
        const job = await jobRepo.createJob(tx, {
          type: input.type,
          payload: input.payload,
          idempotency_key: input.idempotency_key,
          max_attempts: input.max_attempts,
        });
        await outboxRepo.createOutboxEvent(tx, {
          aggregate_type: "execution_job",
          aggregate_id: job.id,
          event_type: EXECUTION_OUTBOX_EVENTS.created,
          payload: { type: job.type },
        });
        return job;
      });
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictError(`execution job idempotency_key already exists: ${input.idempotency_key}`);
      throw e;
    }
  }

  async getJob(id: string): Promise<ExecutionJobRow> {
    const row = await jobRepo.getJob(this.db, id);
    if (!row) throw new NotFoundError(`execution_job ${id} not found`);
    return row;
  }

  listJobs(status?: string, type?: string): Promise<ExecutionJobRow[]> {
    return jobRepo.listJobs(this.db, { status, type });
  }
}
