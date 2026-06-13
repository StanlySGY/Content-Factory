import type { ExecutorType, StageRunStatus } from "@cf/shared";
import { assertTransition } from "../domain/stage-run/status.js";
import type { Db } from "../infrastructure/db/client.js";
import type { StageRunRow, WorkflowStageRow } from "../infrastructure/db/schema.js";
import { workflowStages } from "../infrastructure/db/schema.js";
import { eq } from "drizzle-orm";
import * as stageRepo from "../infrastructure/repositories/stage-run.repository.js";
import type { ExecutionBridgeService } from "./execution-bridge.service.js";

// WorkflowOrchestrator：DAG 自动推进引擎。
// 职责：stage_run 创建后，对 executor_type=agent 的 stage 自动推进 pending→running 并触发 execution。
// 不做 writeback / 审批 / 人工 stage 逻辑。

export class WorkflowOrchestrator {
  constructor(
    private readonly db: Db,
    private readonly bridge: ExecutionBridgeService,
  ) {}

  async advanceStageRuns(
    projectId: string,
    stageRuns: StageRunRow[],
  ): Promise<void> {
    for (const sr of stageRuns) {
      if ((sr.status as StageRunStatus) !== "pending") continue;
      const stage = await this.getStage(sr.workflowStageId);
      if (!stage) continue;
      if ((stage.executorType as ExecutorType) !== "agent") continue;

      const agentProfileId = sr.agentProfileId ?? stage.agentProfileId;
      if (!agentProfileId) continue;

      assertTransition(sr.status as StageRunStatus, "running");
      await stageRepo.updateStatus(this.db, projectId, sr.id, "running");
      await this.requestExecution(sr.id, projectId, agentProfileId);
    }
  }

  private async getStage(stageId: string): Promise<WorkflowStageRow | null> {
    const [row] = await this.db
      .select()
      .from(workflowStages)
      .where(eq(workflowStages.id, stageId))
      .limit(1);
    return row ?? null;
  }

  private async requestExecution(
    stageRunId: string,
    projectId: string,
    agentProfileId: string,
  ): Promise<void> {
    await this.bridge.requestExecution({
      subjectRef: {
        subjectType: "workflow_stage_run",
        subjectId: stageRunId,
        projectId,
        metadata: { agent_profile_id: agentProfileId },
      },
      jobType: "agent",
      payload: { agent_profile_id: agentProfileId },
    });
  }
}
