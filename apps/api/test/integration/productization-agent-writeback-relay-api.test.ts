import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AUDIT_SUBJECT_STAGE_RUN } from "@cf/shared";
import { WorkflowDefinitionService, type CreateDefinitionInput } from "../../src/application/workflow-definition.service.js";
import { WorkflowRunService } from "../../src/application/workflow-run.service.js";
import type { RequestContext } from "../../src/application/task.service.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, runInProject, type Db } from "../../src/infrastructure/db/client.js";
import { auditEvents, contentTasks, executionWritebacks, stageRuns } from "../../src/infrastructure/db/schema.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;
let defSvc: WorkflowDefinitionService;
let runSvc: WorkflowRunService;
let activeDefId: string;

const projectId = DEFAULT_PROJECT_ID;
const ctx: RequestContext = { projectId, actorId: DEFAULT_USER_ID, requestId: "productization-2" };
const v1 = { schema_version: 1 } as const;
const apiKey = "sk-productization-writeback";

const defInput = (name: string): CreateDefinitionInput => ({
  name,
  version: 1,
  definition_schema: v1,
  stages: [
    { key: "writing", name: "Writing", position: 1, executor_type: "agent", input_schema: v1, output_schema: v1, gate_schema: v1 },
  ],
  dependencies: [],
});

async function mkTask(): Promise<string> {
  const [task] = await db
    .insert(contentTasks)
    .values({
      projectId,
      title: `Productization 2 ${randomUUID()}`,
      contentType: "article",
      priority: "normal",
      requirementData: v1,
    })
    .returning();
  return task!.id;
}

async function runningStage(): Promise<string> {
  const { initialStages } = await runSvc.startWorkflow(ctx, {
    taskId: await mkTask(),
    workflowDefinitionId: activeDefId,
  });
  const stageId = initialStages[0]!.id;
  await runSvc.transitionStageStatus(ctx, stageId, "running");
  return stageId;
}

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_SECRET_STORE_ENABLED: "true",
    EXECUTION_SECRET_INJECTION_ENABLED: "true",
    EXECUTION_WRITEBACK_EXECUTOR_ENABLED: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  });

  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY: apiKey },
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl_productization_2",
      model: "gpt-productization",
      choices: [{ index: 0, message: { role: "assistant", content: "writeback ready" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      created: 1,
    }), {
      status: 200,
      headers: { "x-request-id": "productization-2-provider-request" },
    }),
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  defSvc = new WorkflowDefinitionService(db);
  runSvc = new WorkflowRunService(db);
  const def = await defSvc.createDefinition(ctx, defInput(`productization-2-${randomUUID()}`));
  await defSvc.activateDefinition(ctx, def.id);
  activeDefId = def.id;
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

describe("Productization-2 agent result writeback relay", () => {
  it("registers workflow_stage_run writeback handler when the env flag is enabled", async () => {
    const stageId = await runningStage();
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/bridge/jobs",
      payload: {
        subject_type: "workflow_stage_run",
        subject_id: stageId,
        project_id: projectId,
        job_type: "agent",
        payload: {
          prompt: "Produce the stage output.",
          model: "gpt-productization",
          credential_ref: {
            provider: "openai_compatible",
            key_ref: "env://CONTENT_FACTORY_OPENAI_KEY",
            scope: "project",
          },
        },
        idempotency_key: `productization-2-${randomUUID()}`,
      },
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id as string;

    expect((await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` })).statusCode).toBe(200);
    const processed = await app.inject({
      method: "POST",
      url: "/api/execution/ops/process-outbox-batch",
      payload: { limit: 5 },
    });

    expect(processed.statusCode).toBe(200);
    expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("waiting_review");

    const writebacks = await db
      .select()
      .from(executionWritebacks)
      .where(and(eq(executionWritebacks.subjectType, "workflow_stage_run"), eq(executionWritebacks.subjectId, stageId)));
    expect(writebacks).toHaveLength(1);
    expect(writebacks[0]).toMatchObject({ status: "applied", error: null });

    const audits = await runInProject(db, projectId, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.subjectType, AUDIT_SUBJECT_STAGE_RUN), eq(auditEvents.subjectId, stageId))),
    );
    expect(audits.some((audit) => audit.action === AUDIT_ACTIONS.stageRunStatusChanged)).toBe(true);

    const persisted = JSON.stringify({ writebacks, audits, stages: await db.select().from(stageRuns).where(eq(stageRuns.id, stageId)) });
    expect(persisted).not.toContain(apiKey);
    expect(persisted).not.toContain("Bearer");
  });

  it("keeps the default app relay fail-closed when the writeback flag is disabled", async () => {
    const disabled = await buildApp(loadEnv({
      ...process.env,
      EXECUTION_RUNTIME_MODE: "mock",
      EXECUTION_RUNTIME_ADAPTER_MODE: "mock",
      EXECUTION_WRITEBACK_EXECUTOR_ENABLED: "false",
    }), { logger: false });
    await disabled.app.ready();
    try {
      const stageId = await runningStage();
      const created = await disabled.app.inject({
        method: "POST",
        url: "/api/execution/bridge/jobs",
        payload: {
          subject_type: "workflow_stage_run",
          subject_id: stageId,
          project_id: projectId,
          job_type: "agent",
          payload: { mockStatus: "success" },
          idempotency_key: `productization-2-disabled-${randomUUID()}`,
        },
      });
      expect(created.statusCode).toBe(201);
      const jobId = created.json().id as string;

      expect((await disabled.app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` })).statusCode).toBe(200);
      expect((await disabled.app.inject({
        method: "POST",
        url: "/api/execution/ops/process-outbox-batch",
        payload: { limit: 20 },
      })).statusCode).toBe(200);

      expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("running");
      expect(await db
        .select()
        .from(executionWritebacks)
        .where(and(eq(executionWritebacks.subjectType, "workflow_stage_run"), eq(executionWritebacks.subjectId, stageId))))
        .toHaveLength(0);
    } finally {
      await disabled.close();
    }
  });
});
