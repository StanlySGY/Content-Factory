import { randomUUID } from "node:crypto";
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
    title: `publisher-platform-${randomUUID()}`,
    contentType: "article",
    priority: "normal",
    requirementData: { schema_version: 1 },
    ownerId: DEFAULT_USER_ID,
  }).returning();
  const [asset] = await db!.insert(contentAssets).values({
    contentTaskId: task!.id,
    assetType: "draft",
    title: "Publisher platform draft",
    status: "approved",
  }).returning();
  const [version] = await db!.insert(assetVersions).values({
    contentAssetId: asset!.id,
    version: 1,
    storageUri: "s3://publisher-platform/v1",
    checksum: `sha256:${randomUUID()}`,
    metadata: { schema_version: 1 },
    createdBy: DEFAULT_USER_ID,
  }).returning();
  return { task: task!, asset: asset!, version: version! };
}

function createPublishRecordPayload(fixture: Awaited<ReturnType<typeof createAssetVersionFixture>>, channel: string) {
  return {
    content_task_id: fixture.task.id,
    content_asset_id: fixture.asset.id,
    asset_version_id: fixture.version.id,
    channel,
    idempotency_key: `publish-record-${randomUUID()}`,
  };
}

describe("Product Gap 2 Publisher Platform Backend MVP", () => {
  it("creates, lists and gets publisher channels with per-project key uniqueness", async () => {
    const api = await startApp();
    const key = `channel-${randomUUID()}`;
    const created = await api.inject({
      method: "POST",
      url: "/api/publisher/channels",
      payload: {
        key,
        display_name: "Newsletter",
        endpoint_ref: "publisher://newsletter",
        config: { format: "html" },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      project_id: DEFAULT_PROJECT_ID,
      key,
      display_name: "Newsletter",
      status: "active",
      endpoint_ref: "publisher://newsletter",
      config: { format: "html" },
    });

    const duplicate = await api.inject({
      method: "POST",
      url: "/api/publisher/channels",
      payload: { key, display_name: "Duplicate" },
    });
    expect(duplicate.statusCode).toBe(409);

    const listed = await api.inject({ method: "GET", url: "/api/publisher/channels?status=active" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((channel: { id: string }) => channel.id === created.json().id)).toBe(true);

    const got = await api.inject({ method: "GET", url: `/api/publisher/channels/${created.json().id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().key).toBe(key);
  });

  it("blocks publish record creation when channel is disabled or archived", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const key = `disabled-${randomUUID()}`;
    const created = await api.inject({
      method: "POST",
      url: "/api/publisher/channels",
      payload: { key, display_name: "Temporary Channel" },
    });
    expect(created.statusCode).toBe(201);

    const firstRecord = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: createPublishRecordPayload(fixture, key),
    });
    expect(firstRecord.statusCode).toBe(201);

    const disabled = await api.inject({ method: "POST", url: `/api/publisher/channels/${created.json().id}/disable` });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().status).toBe("disabled");

    const blocked = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: createPublishRecordPayload(fixture, key),
    });
    expect(blocked.statusCode).toBe(409);

    const archived = await api.inject({ method: "POST", url: `/api/publisher/channels/${created.json().id}/archive` });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().status).toBe("archived");

    const restore = await api.inject({
      method: "PATCH",
      url: `/api/publisher/channels/${created.json().id}`,
      payload: { status: "active" },
    });
    expect(restore.statusCode).toBe(409);

    const rows = await db!.select().from(publishRecords);
    expect(rows.filter((row) => row.channel === key)).toHaveLength(1);
  });

  it("keeps the seeded wechat_mp channel compatible with existing publish_records API", async () => {
    const api = await startApp();
    const fixture = await createAssetVersionFixture();
    const created = await api.inject({
      method: "POST",
      url: "/api/publish-records",
      payload: createPublishRecordPayload(fixture, "wechat_mp"),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ channel: "wechat_mp", status: "pending" });
  });
});
