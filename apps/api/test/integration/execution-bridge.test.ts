import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { ExecutionBridgeService } from "../../src/application/execution-bridge.service.js";
import { ExecutionJobService } from "../../src/application/execution-job.service.js";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { loadEnv } from "../../src/config/env.js";
import { ConflictError } from "../../src/domain/errors.js";
import type { RuntimeRequest, RuntimeResponse } from "../../src/domain/execution/runtime-contract.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, outboxEvents } from "../../src/infrastructure/db/schema.js";

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const resetActive = () =>
  db.update(executionJobs).set({ status: "failed" }).where(inArray(executionJobs.status, ["pending", "running"]));
const bridge = () => new ExecutionBridgeService(new ExecutionJobService(db));

describe("Execution bridge service + worker subject flow", () => {
  it("creates a job with a normalized subject envelope and a created outbox carrying subject", async () => {
    const subjectId = randomUUID();
    const job = await bridge().requestExecution({
      subjectRef: { subjectType: "workflow_stage_run", subjectId, projectId: "00000000-0000-0000-0000-000000000010", metadata: { source: "test" } },
      jobType: "agent",
      payload: { mockStatus: "success" },
    });

    expect(job.type).toBe("agent");
    expect(job.payload).toMatchObject({
      schema_version: 1,
      subject: { type: "workflow_stage_run", id: subjectId, project_id: "00000000-0000-0000-0000-000000000010" },
      input: { mockStatus: "success" },
    });

    const [created] = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job.id));
    expect(created?.eventType).toBe("execution_job.created");
    const payload = created?.payload as { type?: string; subject?: { id?: string }; idempotency_key?: string };
    expect(payload.type).toBe("agent");
    expect(payload.subject?.id).toBe(subjectId);
    expect(payload.idempotency_key).toBe(job.idempotencyKey);
  });

  it("returns a ConflictError on duplicate (deterministic) idempotency key", async () => {
    const b = bridge();
    const req = {
      subjectRef: { subjectType: "agent_profile" as const, subjectId: randomUUID() },
      jobType: "agent" as const,
      payload: { x: 1 },
    };
    await b.requestExecution(req);
    await expect(b.requestExecution(req)).rejects.toBeInstanceOf(ConflictError);
  });

  it("passes subject into RuntimeRequest.metadata and preserves it in the terminal outbox payload", async () => {
    await resetActive();
    const subjectId = randomUUID();
    const job = await bridge().requestExecution({
      subjectRef: { subjectType: "workflow_stage_run", subjectId, metadata: {} },
      jobType: "agent",
      payload: { mockStatus: "success" },
    });

    let captured: RuntimeRequest | undefined;
    const capturingFactory = {
      getRuntime: () => ({
        execute: async (request: RuntimeRequest): Promise<RuntimeResponse> => {
          captured = request;
          return { jobId: request.jobId, status: "success", output: { ok: true }, error: null, errorType: null, retryable: false, durationMs: 1, metadata: {} };
        },
      }),
    };

    const updated = await new ExecutionWorker(db, capturingFactory).tick();

    expect(updated?.id).toBe(job.id);
    expect((captured?.metadata as { subject?: { id?: string } }).subject?.id).toBe(subjectId);
    // runtime 只看到 input（不含 envelope）
    expect(captured?.payload).toEqual({ mockStatus: "success" });

    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job.id));
    const success = events.find((e) => e.eventType === "execution_job.success");
    expect((success?.payload as { subject?: { id?: string } }).subject?.id).toBe(subjectId);
    expect((success?.payload as { runtime?: { status?: string } }).runtime?.status).toBe("success");
  });
});
