import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import { AgentRealRuntime } from "../../src/application/runtime/agent-real-runtime.js";
import { FakeAgentProviderHttpClient } from "../../src/application/runtime/fake-agent-provider-http-client.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(() => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const credentialRef = {
  provider: "openai_compatible",
  keyRef: "secret://llm/openai-compatible",
  scope: "project" as const,
};

function realWorker() {
  return new ExecutionWorker(
    db,
    new MockRuntimeAdapterFactory({
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: true,
      adapterMode: "real",
      realAgentRuntime: new AgentRealRuntime(new FakeAgentProviderHttpClient()),
    }),
    5000,
    30000,
    30000,
    { mode: "real_enabled", allowRealExecution: true, allowNetwork: true },
  );
}

describe("Agent real runtime worker closed-loop", () => {
  it("uses injected real runtime to write execution result and outbox without touching Sprint-4 tables", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const [job] = await db.insert(executionJobs).values({
      type: "agent",
      status: "pending",
      payload: {
        prompt: "hello",
        fakeOutputText: "real-worker-ok",
        token: "job-secret",
        credential_ref: credentialRef,
      },
      idempotencyKey: `real-runtime-${randomUUID()}`,
      maxAttempts: 1,
    }).returning();

    const updated = await realWorker().tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job!.id));
    const success = events.find((e) => e.eventType === "execution_job.success");

    expect(updated.status).toBe("success");
    expect(result).toMatchObject({
      status: "success",
      runtimeStatus: "success",
      retryable: false,
      responseSnapshot: {
        metadata: {
          adapterMode: "real",
          providerKind: "openai_compatible",
          realTransportInjected: true,
          secret_material_read: false,
          secret_material_returned: false,
        },
      },
    });
    expect(success?.payload).toMatchObject({
      result_id: result!.id,
      runtime: {
        status: "success",
      },
    });
    const snapshots = JSON.stringify({ result, events });
    expect(snapshots).not.toContain("job-secret");
    expect(snapshots).not.toContain("secret://llm/openai-compatible");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });

  it("keeps default real adapter mode fail-closed when no real runtime is injected", async () => {
    const [job] = await db.insert(executionJobs).values({
      type: "agent",
      status: "pending",
      payload: { credential_ref: credentialRef },
      idempotencyKey: `real-runtime-default-${randomUUID()}`,
      maxAttempts: 1,
    }).returning();
    const worker = new ExecutionWorker(
      db,
      new MockRuntimeAdapterFactory({
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: true,
        adapterMode: "real",
      }),
      5000,
      30000,
      30000,
      { mode: "real_enabled", allowRealExecution: true, allowNetwork: true },
    );

    const updated = await worker.tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);

    expect(updated.status).toBe("failed");
    expect(result!.errorType).toBe("validation_error");
    expect(JSON.stringify(result!.responseSnapshot)).toContain("agent real adapter disabled fixture is not executable");
  });
});
