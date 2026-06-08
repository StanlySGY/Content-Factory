import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
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

const credentialRef = { provider: "openai_compatible", keyRef: "secret://llm/openai-compatible", scope: "project" as const };
const worker = () => new ExecutionWorker(
  db,
  new MockRuntimeAdapterFactory({ mode: "real_enabled", allowRealExecution: true, adapterMode: "provider_preflight" }),
  5000,
  30000,
  30000,
  { mode: "real_enabled", allowRealExecution: true },
);

describe("Provider preflight worker", () => {
  it("agent job writes redacted result and outbox without touching Sprint-4 tables", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const [job] = await db.insert(executionJobs).values({
      type: "agent",
      status: "pending",
      payload: { prompt: "hello", token: "job-secret", fakeOutputText: "ok", credential_ref: credentialRef },
      idempotencyKey: `provider-preflight-${randomUUID()}`,
      maxAttempts: 1,
    }).returning();

    const updated = await worker().tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job!.id));

    expect(updated.status).toBe("success");
    expect(result!.status).toBe("success");
    expect(JSON.stringify(result!.responseSnapshot)).toContain("openai_compatible");
    expect(JSON.stringify(result!.requestSnapshot)).not.toContain("job-secret");
    expect(JSON.stringify(events)).not.toContain("job-secret");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });

  it("mcp job fails safely", async () => {
    const [job] = await db.insert(executionJobs).values({
      type: "mcp",
      status: "pending",
      payload: { credential_ref: credentialRef },
      idempotencyKey: `provider-preflight-mcp-${randomUUID()}`,
      maxAttempts: 1,
    }).returning();

    const updated = await worker().tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);

    expect(updated.status).toBe("failed");
    expect(result!.errorType).toBe("validation_error");
    expect(JSON.stringify(result!.responseSnapshot)).toContain("provider preflight only supports agent");
  });
});
