import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExecutionWritebackReadinessHandler } from "../../src/application/execution-writeback-readiness.js";
import { OutboxRelay } from "../../src/application/outbox-relay.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { outboxEvents } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let db: Db;
let pool: ReturnType<typeof createPool>;

beforeAll(async () => {
  const env = loadEnv();
  built = await buildApp(env, { logger: false });
  app = built.app;
  db = createDb((pool = createPool(env.databaseUrl)));
  await app.ready();
});

afterAll(async () => {
  await pool.end();
  await built.close();
});

async function createProcessedWriteback() {
  const subjectId = randomUUID();
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/bridge/jobs",
    payload: {
      subject_type: "workflow_stage_run",
      subject_id: subjectId,
      job_type: "agent",
      payload: { mockStatus: "success" },
    },
  });
  const jobId = created.json().id;
  await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
  const resultId = results.json()[0].id;
  const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, jobId));
  const success = events.find((e) => e.eventType === "execution_job.success")!;
  await new OutboxRelay(db, [createExecutionWritebackReadinessHandler(db)]).processEvent(success.id);
  return { resultId, subjectId };
}

describe("Execution writeback observability API", () => {
  it("lists writebacks for a result and fetches a writeback by id", async () => {
    const { resultId, subjectId } = await createProcessedWriteback();

    const list = await app.inject({ method: "GET", url: `/api/execution/results/${resultId}/writebacks` });
    expect(list.statusCode).toBe(200);
    const rows = list.json() as Array<{ id: string; execution_result_id: string; subject_id: string; status: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ execution_result_id: resultId, subject_id: subjectId, status: "planned" });

    const one = await app.inject({ method: "GET", url: `/api/execution/writebacks/${rows[0]!.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ id: rows[0]!.id, execution_result_id: resultId });
  });

  it("filters writebacks by subject and returns 404 for unknown id", async () => {
    const { subjectId } = await createProcessedWriteback();

    const list = await app.inject({
      method: "GET",
      url: `/api/execution/writebacks?subject_type=workflow_stage_run&subject_id=${subjectId}`,
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ subject_id: string }>).every((r) => r.subject_id === subjectId)).toBe(true);

    expect((await app.inject({ method: "GET", url: `/api/execution/writebacks/${randomUUID()}` })).statusCode).toBe(404);
  });
});
