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

async function createTask(title = "Knowledge Source Restore Task"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: `${title} ${randomUUID()}`,
      content_type: "article",
      priority: "normal",
      requirement_data: { schema_version: 1, summary: "knowledge source restore test" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

async function createSource(name = "Knowledge Source Restore Source") {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `${name} ${randomUUID()}`,
      source_type: "document",
      uri: `kb://source-restore/${randomUUID()}`,
      metadata: { purpose: "source restore" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, token: string, title = "Restore source candidate") {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: {
      title,
      body: `Use ${token} when checking restored knowledge source behavior.`,
      tags: [token, "source-restore"],
      metadata: { section: title },
    },
  });
  return response;
}

describe("Product Gap 11 Knowledge Source Restore Backend MVP", () => {
  it("restores an archived knowledge source and re-enables knowledge flow", async () => {
    const token = `source-restore-${randomUUID()}`;
    const taskId = await createTask();
    const source = await createSource();
    const entry = await createEntry(source.id, token);
    expect(entry.statusCode).toBe(201);

    const archived = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      id: source.id,
      status: "archived",
    });

    const searchBefore = await app.inject({
      method: "GET",
      url: `/api/knowledge/search?q=${token}&limit=5`,
    });
    expect(searchBefore.statusCode).toBe(200);
    expect(searchBefore.json().items).toHaveLength(0);

    const restored = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      id: source.id,
      status: "active",
    });

    const searchAfter = await app.inject({
      method: "GET",
      url: `/api/knowledge/search?q=${token}&limit=5`,
    });
    expect(searchAfter.statusCode).toBe(200);
    expect(searchAfter.json().items).toContainEqual(expect.objectContaining({ id: entry.json().id, status: "active" }));

    const candidates = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/knowledge-candidates?q=${token}&limit=5`,
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().items).toContainEqual(expect.objectContaining({ id: entry.json().id, reason: "keyword_match" }));

    const materialize = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/knowledge-context-pack`,
      payload: { q: token, limit: 5, version: 1 },
    });
    expect(materialize.statusCode).toBe(201);
    expect(materialize.json().source_refs.knowledge_source_ids).toContain(source.id);

    const createdAfterRestore = await createEntry(source.id, `${token}-new`, "New entry after restore");
    expect(createdAfterRestore.statusCode).toBe(201);
  });

  it("returns 404 for unknown knowledge sources", async () => {
    const missing = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${randomUUID()}/restore`,
    });
    expect(missing.statusCode).toBe(404);
  });
});
