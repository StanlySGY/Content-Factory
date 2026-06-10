import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

let built: BuiltApp;
let app: FastifyInstance;

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await built.close();
});

async function createTask(title = "Knowledge Entry Restore Task"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: `${title} ${randomUUID()}`,
      content_type: "article",
      priority: "normal",
      requirement_data: { schema_version: 1, summary: "knowledge entry restore test" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

async function createSource(name = "Knowledge Entry Restore Source") {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `${name} ${randomUUID()}`,
      source_type: "document",
      uri: `kb://entry-restore/${randomUUID()}`,
      metadata: { purpose: "entry restore" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, token: string, title = "Restore candidate") {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: {
      title,
      body: `Use ${token} when checking restored knowledge entry behavior.`,
      tags: [token, "restore"],
      metadata: { section: title },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function archiveEntry(entryId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/entries/${entryId}/archive`,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe("Product Gap 10 Knowledge Entry Restore Backend MVP", () => {
  it("restores an archived knowledge entry into search and materialization", async () => {
    const token = `entry-restore-${randomUUID()}`;
    const taskId = await createTask();
    const source = await createSource();
    const entry = await createEntry(source.id, token);
    await archiveEntry(entry.id);

    const restored = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${entry.id}/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      id: entry.id,
      source_id: source.id,
      status: "active",
    });

    const search = await app.inject({
      method: "GET",
      url: `/api/knowledge/search?q=${token}&limit=5`,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().items).toContainEqual(expect.objectContaining({ id: entry.id, status: "active" }));

    const materialize = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/knowledge-context-pack`,
      payload: { q: token, limit: 5, version: 1 },
    });
    expect(materialize.statusCode).toBe(201);
    expect(materialize.json().source_refs.knowledge_entry_ids).toContain(entry.id);
  });

  it("rejects restore when the parent knowledge source is archived", async () => {
    const source = await createSource("Archived Restore Source");
    const entry = await createEntry(source.id, `source-archived-${randomUUID()}`);
    await archiveEntry(entry.id);

    const archivedSource = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/archive`,
    });
    expect(archivedSource.statusCode).toBe(200);

    const restored = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${entry.id}/restore`,
    });
    expect(restored.statusCode).toBe(409);
  });

  it("returns 404 for unknown knowledge entries", async () => {
    const missing = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${randomUUID()}/restore`,
    });
    expect(missing.statusCode).toBe(404);
  });
});
