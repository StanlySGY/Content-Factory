import {
  buildExecutionIdempotencyKey,
  buildExecutionPayload,
  validateExecutionBridgeRequest,
  type CreateExecutionRequest,
} from "../domain/execution/bridge.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import type { ExecutionJobService } from "./execution-job.service.js";

// ExecutionBridgeService：控制平面接入 execution plane 的稳定入口（Phase 1.8，Mock-only）。
// 职责：校验桥接请求 → 归一化 payload + 幂等键 → 复用 ExecutionJobService.createJob（同事务 job + created outbox）。
// 严格约束：不读 workflow_runs/stage_runs/agent_profiles/mcp_tools，不判业务状态合法性，不改任何 Sprint-4 表。
export class ExecutionBridgeService {
  constructor(private readonly jobService: ExecutionJobService) {}

  requestExecution(input: CreateExecutionRequest): Promise<ExecutionJobRow> {
    validateExecutionBridgeRequest(input);
    const idempotencyKey = input.idempotencyKey ?? buildExecutionIdempotencyKey(input);
    const payload = buildExecutionPayload(input) as unknown as Record<string, unknown>;
    return this.jobService.createJob({
      type: input.jobType,
      payload,
      idempotency_key: idempotencyKey,
    });
  }
}
