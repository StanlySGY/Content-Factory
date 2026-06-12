import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  ExecutionJobSchema,
  IdParamSchema,
  RequestStageExecutionSchema,
  ResolvedContextSchema,
  StageRunSchema,
  StageStatusBodySchema,
} from "@cf/shared";
import {
  toContextPackDTO,
  toExecutionJobDTO,
  toStageRunDTO,
} from "../../../application/mappers.js";
import type { AgentProfileService } from "../../../application/agent-profile.service.js";
import type { ContextPackService } from "../../../application/context-pack.service.js";
import type { ExecutionBridgeService } from "../../../application/execution-bridge.service.js";
import type { WorkflowRunService } from "../../../application/workflow-run.service.js";
import { selectAgentProvider } from "../../../domain/agent/agent-provider-selector.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface StageRunRoutesOptions {
  env: Env;
  runService: WorkflowRunService;
  contextService: ContextPackService;
  executionBridgeService: ExecutionBridgeService;
  agentProfileService: AgentProfileService;
}

// 阶段运行端点（重试 / 状态流转 / 上下文解析 / Phase 1.8 Mock-only 执行请求）
export const stageRunRoutes: FastifyPluginAsyncTypebox<StageRunRoutesOptions> = async (
  app,
  { env, runService, contextService, executionBridgeService, agentProfileService },
) => {
  app.post(
    "/api/stage-runs/:id/retry",
    { schema: { params: IdParamSchema, response: { 200: StageRunSchema } } },
    async (request) =>
      toStageRunDTO(await runService.retryStage(buildContext(env, request), request.params.id)),
  );

  app.get(
    "/api/stage-runs/:id",
    { schema: { params: IdParamSchema, response: { 200: StageRunSchema } } },
    async (request) =>
      toStageRunDTO(await runService.getStageRun(buildContext(env, request), request.params.id)),
  );

  app.post(
    "/api/stage-runs/:id/status",
    { schema: { params: IdParamSchema, body: StageStatusBodySchema, response: { 200: StageRunSchema } } },
    async (request) =>
      toStageRunDTO(
        await runService.transitionStageStatus(
          buildContext(env, request),
          request.params.id,
          request.body.status,
        ),
      ),
  );

  app.get(
    "/api/stage-runs/:id/context",
    { schema: { params: IdParamSchema, response: { 200: ResolvedContextSchema } } },
    async (request) => {
      const r = await contextService.resolveForStageRun(buildContext(env, request), request.params.id);
      return {
        task: r.task ? toContextPackDTO(r.task) : null,
        stage: r.stage ? toContextPackDTO(r.stage) : null,
        merged: r.merged,
      };
    },
  );

  // 以 path id 作为 workflow_stage_run subject 显式请求 agent execution job。
  // 不读/不校验/不更新 stage_runs，不触碰 stage run 状态机；仅经 bridge 创建 execution job。
  // 传 agent_profile_id 时：读该 profile，从 constraints 解析 provider，注入 credential_ref + prompt
  //   → 把 job 路由到对应 runtime（如 local_cli → Claude Code）。不传则维持原 mock 行为。
  app.post(
    "/api/stage-runs/:id/request-execution",
    { schema: { params: IdParamSchema, body: RequestStageExecutionSchema, response: { 201: ExecutionJobSchema } } },
    async (request, reply) => {
      const { id } = request.params;
      const b = request.body;
      let providerPayload: Record<string, unknown> = {};
      if (b.agent_profile_id) {
        const profile = await agentProfileService.getProfile(buildContext(env, request), b.agent_profile_id);
        const selection = selectAgentProvider(profile.constraints);
        providerPayload = {
          credential_ref: selection.credentialRef,
          ...(b.prompt !== undefined ? { prompt: b.prompt } : {}),
        };
      }
      const job = await executionBridgeService.requestExecution({
        subjectRef: { subjectType: "workflow_stage_run", subjectId: id, projectId: b.project_id ?? null, metadata: {} },
        jobType: "agent",
        payload: {
          stage_run_id: id,
          ...(b.mock_status ? { mockStatus: b.mock_status } : {}),
          ...(b.input !== undefined ? { input: b.input } : {}),
          ...providerPayload,
        },
        idempotencyKey: b.idempotency_key,
      });
      reply.code(201);
      return toExecutionJobDTO(job);
    },
  );
};
