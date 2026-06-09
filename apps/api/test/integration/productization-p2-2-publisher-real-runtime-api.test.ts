import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import {
  assetVersions,
  contentAssets,
  contentTasks,
  executionResults,
  outboxEvents,
  publishRecords,
  reviewRecords,
  workflowRuns,
} from "../../src/infrastructure/db/schema.js";

let built: BuiltApp | null = null;
let app: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let db: Db | null = null;

const baseEnv = {
  EXECUTION_RUNTIME_MODE: "real_enabled",
  EXECUTION_RUNTIME_ADAPTER_MODE: "real",
  EXECUTION_ALLOW_REAL_RUNTIME: "true",
  EXECUTION_ALLOW_NETWORK: "true",
  EXECUTION_REDACT_SNAPSHOTS: "true",
  EXECUTION_NETWORK_ALLOWLIST: "publisher.example.test",
  EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED: "true",
  EXECUTION_PUBLISHER_ENDPOINT_REGISTRY: "publisher://wechat=https://publisher.example.test/release",
  EXECUTION_PUBLISHER_CHANNEL_ALLOWLIST: "wechat_mp",
};

async function startApp(overrides: Record<string, string | undefined> = {}, fetchImplementation?: typeof fetch) {
  built = await buildApp(loadEnv({ ...process.env, ...overrides }), {
    logger: false,
    fetchImplementation,
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  return app;
}

afterEach(async () => {
  await built?.close();
  await pool?.end();
  built = null;
  app = null;
  pool = null;
  db = null;
});

async function createPublishRecord(api: FastifyInstance) {
  const [task] = await db!.insert(contentTasks).values({
    projectId: DEFAULT_PROJECT_ID,
    title: `publisher-real-${randomUUID()}`,
    contentType: "article",
    priority: "normal",
    requirementData: { schema_version: 1 },
    ownerId: DEFAULT_USER_ID,
  }).returning();
  const [asset] = await db!.insert(contentAssets).values({
    contentTaskId: task!.id,
    assetType: "draft",
    title: "Release draft",
    status: "approved",
  }).returning();
  const [version] = await db!.insert(assetVersions).values({
    contentAssetId: asset!.id,
    version: 1,
    storageUri: "s3://publisher-real/v1",
    checksum: `sha256:${randomUUID()}`,
    metadata: { schema_version: 1 },
    createdBy: DEFAULT_USER_ID,
  }).returning();
  const created = await api.inject({
    method: "POST",
    url: "/api/publish-records",
    payload: {
      content_task_id: task!.id,
      content_asset_id: asset!.id,
      asset_version_id: version!.id,
      channel: "wechat_mp",
      idempotency_key: `publish-record-${randomUUID()}`,
    },
  });
  expect(created.statusCode).toBe(201);
  return created.json();
}

describe("Productization-P2.2 Publisher real runtime", () => {
  it("reports publisher real runtime readiness as blocked by default and ready when explicitly gated", async () => {
    const defaultApp = await startApp();
    const blocked = await defaultApp.inject({ method: "GET", url: "/api/execution/ops/publisher-real-runtime-readiness" });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json()).toMatchObject({
      mode: "publisher_real_runtime_readiness",
      ready: false,
      status: "blocked",
      enabled: false,
    });
    await built!.close();
    await pool!.end();

    const readyApp = await startApp(baseEnv);
    const ready = await readyApp.inject({ method: "GET", url: "/api/execution/ops/publisher-real-runtime-readiness" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ready: true,
      status: "ready",
      enabled: true,
      endpoint_registry_count: 1,
      channel_allowlist_count: 1,
      allow_network: true,
      allow_real_runtime: true,
    });
  });

  it("publishes through execution worker and marks publish_records as published without leaking secrets", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const api = await startApp(baseEnv, async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ externalRef: "wx-draft-1", secret: "Bearer sk-secret" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const beforeReviewCount = (await db!.select().from(reviewRecords)).length;
    const beforeWorkflowCount = (await db!.select().from(workflowRuns)).length;
    const record = await createPublishRecord(api);

    const createdJob = await api.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "publisher",
        payload: {
          action: "publish",
          targetRef: "publisher://wechat",
          channel: "wechat_mp",
          publishRecordId: record.id,
          content: { title: "hello", api_key: "sk-input" },
          preview: { previewId: "preview-1", checksum: "sha256:abc" },
          approved: true,
          approvalRef: "approval-1",
        },
        idempotency_key: `publisher-real-${randomUUID()}`,
        max_attempts: 1,
      },
    });
    expect(createdJob.statusCode).toBe(201);

    const ticked = await api.inject({ method: "POST", url: `/api/execution/jobs/${createdJob.json().id}/tick` });
    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ type: "publisher", status: "success" });

    const [updatedRecord] = await db!.select().from(publishRecords).where(eq(publishRecords.id, record.id));
    const [result] = await db!.select().from(executionResults).where(eq(executionResults.executionJobId, createdJob.json().id));
    const events = await db!.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, createdJob.json().id));

    expect(updatedRecord).toMatchObject({
      status: "published",
      executionJobId: createdJob.json().id,
      externalRef: "wx-draft-1",
    });
    expect(updatedRecord!.publishedAt).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ jobType: "publisher", status: "success" });
    expect(events.some((event) => event.eventType === "execution_job.success")).toBe(true);
    expect(await db!.select().from(reviewRecords)).toHaveLength(beforeReviewCount);
    expect(await db!.select().from(workflowRuns)).toHaveLength(beforeWorkflowCount);
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(result)).not.toContain("sk-input");
    expect(JSON.stringify(events)).not.toContain("sk-secret");
    expect(JSON.stringify(events)).not.toContain("sk-input");
  });

  it("marks publish_records failed when real publisher endpoint fails", async () => {
    const api = await startApp(baseEnv, async () =>
      new Response(JSON.stringify({ message: "publisher unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    const record = await createPublishRecord(api);
    const createdJob = await api.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "publisher",
        payload: {
          action: "publish",
          targetRef: "publisher://wechat",
          channel: "wechat_mp",
          publishRecordId: record.id,
          content: { title: "hello" },
          preview: { previewId: "preview-1", checksum: "sha256:abc" },
          approved: true,
          approvalRef: "approval-1",
        },
        idempotency_key: `publisher-real-fail-${randomUUID()}`,
        max_attempts: 1,
      },
    });

    const ticked = await api.inject({ method: "POST", url: `/api/execution/jobs/${createdJob.json().id}/tick` });
    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ type: "publisher", status: "failed" });
    const [updatedRecord] = await db!.select().from(publishRecords).where(eq(publishRecords.id, record.id));
    expect(updatedRecord).toMatchObject({
      status: "failed",
      executionJobId: createdJob.json().id,
    });
    expect(JSON.stringify(updatedRecord!.errorData)).toContain("publisher unavailable");
  });
});
