import { NotFoundError } from "../domain/errors.js";
import type { ExecutionResultSummary } from "../domain/execution/result.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionResultRow } from "../infrastructure/db/schema.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";

// ExecutionResultService：结果账本只读观测面（按 job 列出 / 单条 / 汇总）。不写、不 join 业务表。
export class ExecutionResultService {
  constructor(private readonly db: Db) {}

  listByJob(jobId: string): Promise<ExecutionResultRow[]> {
    return resultRepo.listResultsByJob(this.db, jobId);
  }

  async getResult(id: string): Promise<ExecutionResultRow> {
    const row = await resultRepo.getExecutionResult(this.db, id);
    if (!row) throw new NotFoundError(`execution_result ${id} not found`);
    return row;
  }

  summaryByJob(jobId: string): Promise<ExecutionResultSummary> {
    return resultRepo.summarizeResultsByJob(this.db, jobId);
  }
}
