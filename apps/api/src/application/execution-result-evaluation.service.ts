import type { CreateExecutionResultEvaluationBody } from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  normalizeEvaluationTags,
  summarizeEvaluations,
  validateExecutionResultEvaluation,
  type ExecutionResultEvaluationSummary,
} from "../domain/execution/evaluation.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionResultEvaluationRow } from "../infrastructure/db/schema.js";
import * as evaluationRepo from "../infrastructure/repositories/execution-result-evaluation.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";

export class ExecutionResultEvaluationService {
  constructor(private readonly db: Db) {}

  async createEvaluation(
    ctx: RequestContext,
    resultId: string,
    input: CreateExecutionResultEvaluationBody,
  ): Promise<ExecutionResultEvaluationRow> {
    validateExecutionResultEvaluation(input);
    const actorId = this.requireActor(ctx);
    const result = await resultRepo.getExecutionResult(this.db, resultId);
    if (!result) throw new NotFoundError(`execution_result ${resultId} not found`);
    try {
      return await evaluationRepo.createEvaluation(this.db, {
        execution_result_id: resultId,
        execution_job_id: result.executionJobId,
        evaluator_type: input.evaluator_type,
        quality_score: input.quality_score,
        cost_score: input.cost_score,
        latency_score: input.latency_score,
        notes: input.notes ?? null,
        tags: normalizeEvaluationTags(input.tags),
        evaluated_by: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictError(`execution_result ${resultId} already has ${input.evaluator_type} evaluation`);
      throw error;
    }
  }

  async listByResult(resultId: string): Promise<ExecutionResultEvaluationRow[]> {
    const result = await resultRepo.getExecutionResult(this.db, resultId);
    if (!result) throw new NotFoundError(`execution_result ${resultId} not found`);
    return evaluationRepo.listEvaluationsByResult(this.db, resultId);
  }

  async summaryByJob(jobId: string): Promise<ExecutionResultEvaluationSummary> {
    return summarizeEvaluations(jobId, await evaluationRepo.listEvaluationsByJob(this.db, jobId));
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("execution result evaluation requires an actor");
    return ctx.actorId;
  }
}
