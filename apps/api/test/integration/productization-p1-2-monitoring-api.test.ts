import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import {
  executionJobs,
  executionResults,
  executionWritebacks,
  outboxEvents,
} from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_MONITORING_ENABLED: "true",
    EXECUTION_ALERT_FAILED_JOBS_THRESHOLD: "1",
    EXECUTION_ALERT_OUTBOX_BACKLOG_THRESHOLD: "1",
    EXECUTION_ALERT_WRITEBACK_FAILED_THRESHOLD: "1",
    EXECUTION_ALERT_RATE_LIMITED_THRESHOLD: "1",
  });
  built = await buildApp(env, { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

async function seedMonitoringSignals(): Promise<void> {
  const [job] = await db
    .insert(executionJobs)
    .values({
      type: "agent",
      status: "failed",
      payload: { credential_ref: { key_ref: "secret://llm/openai" } },
      idempotencyKey: `monitoring-${randomUUID()}`,
      attemptCount: 1,
      maxAttempts: 1,
      lastError: "rate limited",
      finishedAt: new Date(),
    })
    .returning();

  const [result] = await db
    .insert(executionResults)
    .values({
      executionJobId: job!.id,
      attemptNo: 1,
      jobType: "agent",
      status: "failed",
      runtimeStatus: "failed",
      errorType: "rate_limited",
      retryable: true,
      durationMs: 1,
      requestSnapshot: { redacted: true },
      responseSnapshot: { error: { type: "rate_limited" } },
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
    })
    .returning();

  const [event] = await db
    .insert(outboxEvents)
    .values({
      aggregateType: "execution_job",
      aggregateId: job!.id,
      eventType: "execution_job.failed",
      payload: {},
      error: "handler failed",
    })
    .returning();

  await db.insert(executionWritebacks).values({
    idempotencyKey: `monitoring-writeback-${randomUUID()}`,
    outboxEventId: event!.id,
    executionResultId: result!.id,
    executionJobId: job!.id,
    subjectType: "workflow_stage_run",
    subjectId: randomUUID(),
    status: "failed",
    plan: {},
    error: "writeback failed",
  });
}

describe("Productization-P1.2 execution monitoring endpoints", () => {
  it("reports monitoring readiness and rules without exposing secret material", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/monitoring-readiness" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "execution_monitoring_readiness",
      ready: true,
      status: "ready",
      exporter_enabled: true,
      exporter_format: "prometheus_text",
      pull_based: true,
      network_push_enabled: false,
      rules: expect.arrayContaining([
        expect.objectContaining({
          id: "execution_jobs_failed",
          metric: "content_factory_execution_jobs_failed",
          severity: "critical",
          threshold: 1,
          comparison: "gte",
          enabled: true,
        }),
      ]),
    });
    expect(JSON.stringify(res.json())).not.toContain("Bearer");
    expect(JSON.stringify(res.json())).not.toContain("sk-");
  });

  it("exports prometheus text metrics from execution plane aggregates only", async () => {
    await seedMonitoringSignals();

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/metrics" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("# TYPE content_factory_execution_jobs_failed gauge");
    expect(res.body).toContain("content_factory_execution_jobs_failed");
    expect(res.body).toContain("content_factory_execution_outbox_unprocessed");
    expect(res.body).toContain("content_factory_execution_outbox_failed");
    expect(res.body).toContain("content_factory_execution_writebacks_failed_or_skipped");
    expect(res.body).toContain("content_factory_execution_results_rate_limited");
    expect(res.body).toContain("content_factory_execution_latest_result_timestamp_seconds");
    expect(res.body).not.toContain("Bearer");
    expect(res.body).not.toContain("sk-");
  });

  it("includes monitoring alert summary in P1 production readiness", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/production-readiness-p1" });

    expect(res.statusCode).toBe(200);
    expect(res.json().alerts).toMatchObject({
      exporter_enabled: true,
      exporter_format: "prometheus_text",
      network_push_enabled: false,
    });
    expect(res.json().alerts.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metric: "content_factory_execution_jobs_failed",
        threshold: 1,
      }),
    ]));
  });
});
