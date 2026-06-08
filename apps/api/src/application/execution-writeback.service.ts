import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionWritebackRow } from "../infrastructure/db/schema.js";
import * as writebackRepo from "../infrastructure/repositories/execution-writeback.repository.js";

// ExecutionWritebackService：writeback ledger 只读观测面；不写控制面，不 join 业务表。
export class ExecutionWritebackService {
  constructor(private readonly db: Db) {}

  async getWriteback(id: string): Promise<ExecutionWritebackRow> {
    const row = await writebackRepo.getWriteback(this.db, id);
    if (!row) throw new NotFoundError(`execution_writeback ${id} not found`);
    return row;
  }

  listByResult(resultId: string): Promise<ExecutionWritebackRow[]> {
    return writebackRepo.listWritebacksByResult(this.db, resultId);
  }

  listBySubject(subjectType?: string, subjectId?: string): Promise<ExecutionWritebackRow[]> {
    if (!subjectType || !subjectId)
      throw new ValidationError("subject_type and subject_id are required");
    return writebackRepo.listWritebacksBySubject(this.db, subjectType, subjectId);
  }
}
