import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  buildExecutionWritebackApplyGuard,
  type ExecutionWritebackApplyGuard,
} from "../domain/execution/writeback-apply-guard.js";
import {
  buildDisabledControlPlaneWritebackAdapter,
  buildExecutionWritebackDryRun,
  type ExecutionWritebackDryRun,
} from "../domain/execution/writeback-dry-run.js";
import { buildExecutionWritebackGuard, type ExecutionWritebackGuard } from "../domain/execution/writeback-guard.js";
import {
  buildExecutionWritebackTransactionPlanFromGuard,
  type ExecutionWritebackTransactionPlan,
} from "../domain/execution/writeback-transaction-plan.js";
import {
  buildExecutionWritebackTransactionPrototype,
  type ExecutionWritebackTransactionPrototype,
} from "../domain/execution/writeback-transaction-prototype.js";
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

  async getGuard(id: string): Promise<ExecutionWritebackGuard> {
    const row = await this.getWriteback(id);
    return buildExecutionWritebackGuard({
      writebackId: row.id,
      executionResultId: row.executionResultId,
      executionJobId: row.executionJobId,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      writebackStatus: row.status,
    });
  }

  async getTransactionPlan(id: string): Promise<ExecutionWritebackTransactionPlan> {
    return buildExecutionWritebackTransactionPlanFromGuard(await this.getGuard(id));
  }

  async dryRun(id: string): Promise<ExecutionWritebackDryRun> {
    return buildExecutionWritebackDryRun({
      plan: await this.getTransactionPlan(id),
      adapter: buildDisabledControlPlaneWritebackAdapter(),
    });
  }

  async getApplyGuard(id: string): Promise<ExecutionWritebackApplyGuard> {
    const guard = await this.getGuard(id);
    const plan = buildExecutionWritebackTransactionPlanFromGuard(guard);
    const dryRun = buildExecutionWritebackDryRun({
      plan,
      adapter: buildDisabledControlPlaneWritebackAdapter(),
    });
    return buildExecutionWritebackApplyGuard({ guard, plan, dryRun });
  }

  async getTransactionPrototype(id: string): Promise<ExecutionWritebackTransactionPrototype> {
    return buildExecutionWritebackTransactionPrototype({ applyGuard: await this.getApplyGuard(id) });
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
