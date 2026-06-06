import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_STAGE_RUN,
  AUDIT_SUBJECT_WORKFLOW_RUN,
  type StageRunStatus,
  type WorkflowRunStatus,
} from "@cf/shared";
import {
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { assertTransition as assertStageTransition } from "../domain/stage-run/status.js";
import { assertTransition as assertRunTransition } from "../domain/workflow-run/status.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { StageRunRow, WorkflowRunRow } from "../infrastructure/db/schema.js";
import * as stageRepo from "../infrastructure/repositories/stage-run.repository.js";
import * as defRepo from "../infrastructure/repositories/workflow-definition.repository.js";
import * as runRepo from "../infrastructure/repositories/workflow-run.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

export interface StartWorkflowInput {
  taskId: string;
  workflowDefinitionId: string;
}
export interface StartWorkflowResult {
  run: WorkflowRunRow;
  initialStages: StageRunRow[];
}

// WorkflowRunService：工作流执行引擎。状态流转必经 GenericStateMachine（领域层），仓储不做状态判断。
export class WorkflowRunService {
  constructor(private readonly db: Db) {}

  /**
   * 启动工作流（db §10.1 强一致事务）：① 读定义 ② 校验 active ③ 建 workflow_run
   * ④ 建初始 stage_run（DAG 根） ⑤ 设 current_stage_run ⑥ 写 audit ⑦ 单事务提交。
   * 任一步失败 → 整体回滚（无残留 run / stage_run / audit）。
   */
  async startWorkflow(
    ctx: RequestContext,
    input: StartWorkflowInput,
  ): Promise<StartWorkflowResult> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      // ① 读取定义（scoped）
      const def = await defRepo.getById(tx, ctx.projectId, input.workflowDefinitionId);
      if (!def)
        throw new NotFoundError(`workflow_definition ${input.workflowDefinitionId} not found`);
      // ② 校验 active
      if (def.status !== "active")
        throw new ValidationError(`workflow_definition ${def.id} is not active`, {
          status: def.status,
        });
      const stages = await defRepo.listStages(tx, ctx.projectId, def.id);
      if (stages.length === 0)
        throw new ValidationError(`workflow_definition ${def.id} has no stages`);
      const deps = await defRepo.listDependencies(tx, ctx.projectId, def.id);

      // ③ 创建 workflow_run（MJ-1 活跃唯一冲突 → ConflictError）
      const run = await runRepo.createRun(tx, ctx.projectId, {
        content_task_id: input.taskId,
        workflow_definition_id: def.id,
        workflow_version: def.version,
      });

      // ④ 创建初始 stage_run（无上游依赖的根阶段；多根支持并行起点）
      const hasUpstream = new Set(deps.map((d) => d.stageId));
      const roots = stages
        .filter((s) => !hasUpstream.has(s.id))
        .sort((a, b) => a.position - b.position);
      const initialStages: StageRunRow[] = [];
      for (const s of roots) {
        initialStages.push(
          await stageRepo.create(tx, ctx.projectId, {
            workflow_run_id: run.id,
            workflow_stage_id: s.id,
          }),
        );
      }

      // ⑤ 设置 current_stage_run（首个根阶段）+ run pending→running（经状态机）
      await runRepo.updateCurrentStage(tx, ctx.projectId, run.id, initialStages[0]!.id);
      assertRunTransition(run.status as WorkflowRunStatus, "running");
      const running = (await runRepo.updateStatus(tx, ctx.projectId, run.id, "running"))!;

      // ⑥ 写 audit
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_WORKFLOW_RUN,
        subjectId: run.id,
        action: AUDIT_ACTIONS.workflowRunStarted,
        before: null,
        after: {
          id: run.id,
          status: "running",
          definition_id: def.id,
          initial_stages: initialStages.map((s) => s.id),
        },
        metadata: { request_id: ctx.requestId, task_id: input.taskId },
      });
      // ⑦ runInProject 提交
      return { run: running, initialStages };
    });
  }

  /** 工作流状态流转（必经状态机；非仓储直推）+ 审计 */
  async transitionWorkflowStatus(
    ctx: RequestContext,
    runId: string,
    target: WorkflowRunStatus,
  ): Promise<WorkflowRunRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const run = await runRepo.getRun(tx, ctx.projectId, runId);
      if (!run) throw new NotFoundError(`workflow_run ${runId} not found`);
      assertRunTransition(run.status as WorkflowRunStatus, target); // 非法 → InvalidTransitionError(409)
      const updated = (await runRepo.updateStatus(tx, ctx.projectId, runId, target))!;
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_WORKFLOW_RUN,
        subjectId: runId,
        action: AUDIT_ACTIONS.workflowRunStatusChanged,
        before: { status: run.status },
        after: { status: target },
        metadata: { request_id: ctx.requestId },
      });
      return updated;
    });
  }

  /** 阶段状态流转（必经状态机）+ 同步 current_stage_run + 审计 */
  async transitionStageStatus(
    ctx: RequestContext,
    stageRunId: string,
    target: StageRunStatus,
  ): Promise<StageRunRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const stage = await stageRepo.getById(tx, ctx.projectId, stageRunId);
      if (!stage) throw new NotFoundError(`stage_run ${stageRunId} not found`);
      assertStageTransition(stage.status as StageRunStatus, target);
      const updated = (await stageRepo.updateStatus(tx, ctx.projectId, stageRunId, target))!;
      await runRepo.updateCurrentStage(tx, ctx.projectId, stage.workflowRunId, stageRunId);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_STAGE_RUN,
        subjectId: stageRunId,
        action: AUDIT_ACTIONS.stageRunStatusChanged,
        before: { status: stage.status },
        after: { status: target },
        metadata: { request_id: ctx.requestId, workflow_run_id: stage.workflowRunId },
      });
      return updated;
    });
  }

  /** 重试工作流（db §8.2 failed→running）：仅允许从 failed 恢复 */
  async retryWorkflow(ctx: RequestContext, runId: string): Promise<WorkflowRunRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const run = await runRepo.getRun(tx, ctx.projectId, runId);
      if (!run) throw new NotFoundError(`workflow_run ${runId} not found`);
      if (run.status !== "failed")
        throw new InvalidTransitionError(
          `retry requires failed workflow_run, got ${run.status}`,
        );
      assertRunTransition("failed", "running");
      const updated = (await runRepo.updateStatus(tx, ctx.projectId, runId, "running"))!;
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_WORKFLOW_RUN,
        subjectId: runId,
        action: AUDIT_ACTIONS.workflowRunStatusChanged,
        before: { status: "failed" },
        after: { status: "running" },
        metadata: { request_id: ctx.requestId, retry: true },
      });
      return updated;
    });
  }

  /** 重试阶段（db §8.3 failed→running）：仅允许从 failed 恢复 */
  async retryStage(ctx: RequestContext, stageRunId: string): Promise<StageRunRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const stage = await stageRepo.getById(tx, ctx.projectId, stageRunId);
      if (!stage) throw new NotFoundError(`stage_run ${stageRunId} not found`);
      if (stage.status !== "failed")
        throw new InvalidTransitionError(
          `retry requires failed stage_run, got ${stage.status}`,
        );
      assertStageTransition("failed", "running");
      const updated = (await stageRepo.updateStatus(tx, ctx.projectId, stageRunId, "running"))!;
      await runRepo.updateCurrentStage(tx, ctx.projectId, stage.workflowRunId, stageRunId);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_STAGE_RUN,
        subjectId: stageRunId,
        action: AUDIT_ACTIONS.stageRunStatusChanged,
        before: { status: "failed" },
        after: { status: "running" },
        metadata: { request_id: ctx.requestId, retry: true },
      });
      return updated;
    });
  }

  async getRun(ctx: RequestContext, runId: string): Promise<WorkflowRunRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      runRepo.getRun(tx, ctx.projectId, runId),
    );
    if (!row) throw new NotFoundError(`workflow_run ${runId} not found`);
    return row;
  }

  /** 只读取单阶段（暴露 GET /stage-runs/:id；无业务逻辑，project 隔离经仓储两级 join）*/
  async getStageRun(ctx: RequestContext, stageRunId: string): Promise<StageRunRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      stageRepo.getById(tx, ctx.projectId, stageRunId),
    );
    if (!row) throw new NotFoundError(`stage_run ${stageRunId} not found`);
    return row;
  }

  listRunsByTask(ctx: RequestContext, taskId: string): Promise<WorkflowRunRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      runRepo.listRunsByTask(tx, ctx.projectId, taskId),
    );
  }
}
