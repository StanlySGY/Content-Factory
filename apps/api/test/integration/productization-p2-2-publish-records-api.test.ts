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
  publishRecords,
} from "../../src/infrastructure/db/schema.js";

let built: BuiltApp | null = null;
let app: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let db: Db | null = null;

async function startApp() {
  built = await buildApp(loadEnv(), { logger: false });
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

async function createAssetVersionFixture() {
  const [task] = await db!.insert(contentTasks).values({
    projectId: DEFAULT_PROJECT_ID,
    title: `publish-${randomUUID()}`,
    contentType: "article",
    priority: "normal",
    requirementData: { schema_version: 1 },
    ownerId: DEFAULT_USER_ID,
  }).returning();
  const [asset] = await db!.insert(contentAssets).values({
    contentTaskId: task!.id,
    assetType: "draft",
    title: "Publish draft",
    status: "approved",
  }).returning();
  const [version] = await db!.insert(assetVersions).values({
    contentAssetId: asset!.id,
    version: 1,
    storageUri: "s3://publish/v1",
    checksum: `sha256:${randomUUID()}`,
    metadata: { schema_version: 1 },
    createdBy: DEFAULT_USER_ID,
  }).returning();
  return { task: task!, asset: asset!, version: version! };
}

describe("Productization-P2.2 publish_records API", () => {
  it("creates, lists and gets version-pinned publish records", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const idempotencyKey = `publish-record-${randomUUID()}`;

    const created = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: {
        content_task_id: fixture.task.id,
        content_asset_id: fixture.asset.id,
        asset_version_id: fixture.version.id,
        channel: "wechat_mp",
        idempotency_key: idempotencyKey,
        metadata: { title: "Ready to publish" },
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      content_task_id: fixture.task.id,
      content_asset_id: fixture.asset.id,
      asset_version_id: fixture.version.id,
      channel: "wechat_mp",
      status: "pending",
      idempotency_key: idempotencyKey,
    });

    const listed = await api.inject({
      method: "GET",
      url: `/api/publish-records?task_id=${fixture.task.id}&status=pending&channel=wechat_mp`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);

    const got = await api.inject({ method: "GET", url: `/api/publish-records/${created.json().id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().asset_version_id).toBe(fixture.version.id);

    await expect(
      db!.update(publishRecords)
        .set({ assetVersionId: randomUUID() })
        .where(eq(publishRecords.id, created.json().id)),
    ).rejects.toThrow(/asset_version_id is immutable/i);
  });

  it("enforces idempotency key uniqueness", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const payload = {
      content_task_id: fixture.task.id,
      content_asset_id: fixture.asset.id,
      asset_version_id: fixture.version.id,
      channel: "wechat_mp",
      idempotency_key: `publish-record-${randomUUID()}`,
    };

    expect((await api.inject({ method: "POST", url: "/api/publish-records", payload })).statusCode).toBe(201);
    expect((await api.inject({ method: "POST", url: "/api/publish-records", payload })).statusCode).toBe(409);
  });

  it("withdraws published records while preserving the pinned asset version", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const created = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: {
        content_task_id: fixture.task.id,
        content_asset_id: fixture.asset.id,
        asset_version_id: fixture.version.id,
        channel: "wechat_mp",
        idempotency_key: `publish-record-${randomUUID()}`,
      },
    });
    await db!.update(publishRecords)
      .set({ status: "published", externalRef: "wx-msg-123", publishedAt: new Date() })
      .where(eq(publishRecords.id, created.json().id));

    const withdrawn = await api.inject({
      method: "POST",
      url: `/api/publish-records/${created.json().id}/withdraw`,
    });

    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json()).toMatchObject({
      id: created.json().id,
      status: "withdrawn",
      asset_version_id: fixture.version.id,
      external_ref: "wx-msg-123",
    });

    const secondWithdraw = await api.inject({
      method: "POST",
      url: `/api/publish-records/${created.json().id}/withdraw`,
    });
    expect(secondWithdraw.statusCode).toBe(409);
  });

  it("resends failed records as new pending records pinned to the same asset version", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const created = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: {
        content_task_id: fixture.task.id,
        content_asset_id: fixture.asset.id,
        asset_version_id: fixture.version.id,
        channel: "wechat_mp",
        idempotency_key: `publish-record-${randomUUID()}`,
        metadata: { title: "Retry me" },
      },
    });
    await db!.update(publishRecords)
      .set({ status: "failed", errorData: { message: "temporary publisher failure" } })
      .where(eq(publishRecords.id, created.json().id));
    const resendKey = `publish-record-resend-${randomUUID()}`;

    const resent = await api.inject({
      method: "POST",
      url: `/api/publish-records/${created.json().id}/resend`,
      payload: { idempotency_key: resendKey },
    });

    expect(resent.statusCode).toBe(201);
    expect(resent.json()).toMatchObject({
      content_task_id: fixture.task.id,
      content_asset_id: fixture.asset.id,
      asset_version_id: fixture.version.id,
      channel: "wechat_mp",
      status: "pending",
      idempotency_key: resendKey,
      metadata: {
        title: "Retry me",
        resent_from_publish_record_id: created.json().id,
      },
    });
    expect(resent.json().id).not.toBe(created.json().id);

    const original = await api.inject({ method: "GET", url: `/api/publish-records/${created.json().id}` });
    expect(original.json().status).toBe("failed");
  });

  it("rejects resend for records that are still in progress", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const created = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: {
        content_task_id: fixture.task.id,
        content_asset_id: fixture.asset.id,
        asset_version_id: fixture.version.id,
        channel: "wechat_mp",
        idempotency_key: `publish-record-${randomUUID()}`,
      },
    });

    const resend = await api.inject({
      method: "POST",
      url: `/api/publish-records/${created.json().id}/resend`,
      payload: { idempotency_key: `publish-record-resend-${randomUUID()}` },
    });

    expect(resend.statusCode).toBe(409);
  });
});
