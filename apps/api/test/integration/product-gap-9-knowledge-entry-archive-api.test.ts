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

async function createTask(title = "Knowledge Entry Archive Task"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: `${title} ${randomUUID()}`,
      content_type: "article",
      priority: "normal",
      requirement_data: { schema_version: 1, summary: "knowledge entry archive test" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

async function createSource(name = "Knowledge Entry Archive Source") {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `${name} ${randomUUID()}`,
      source_type: "document",
      uri: `kb://entry-archive/${randomUUID()}`,
      metadata: { purpose: "entry archive" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, token: string, title = "Archive candidate") {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: {
      title,
      body: `Use ${token} when checking archived knowledge entry behavior.`,
      tags: [token, "archive"],
      metadata: { section: title },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("Product Gap 9 Knowledge Entry Archive Backend MVP", () => {
  it("archives a single knowledge entry and excludes it from search and materialization", async () => {
    const token = `entry-archive-${randomUUID()}`;
    const taskId = await createTask();
    const source = await createSource();
    const entry = await createEntry(source.id, token);

    const archived = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${entry.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      id: entry.id,
      source_id: source.id,
      status: "archived",
    });

    const search = await app.inject({
      method: "GET",
      url: `/api/knowledge/search?q=${token}&limit=5`,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().items).toHaveLength(0);

    const materialize = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/knowledge-context-pack`,
      payload: { q: token, limit: 5, version: 1 },
    });
    expect(materialize.statusCode).toBe(404);
  });

  it("archives entries without archiving their source or blocking new entries", async () => {
    const source = await createSource("Entry Archive Keeps Source Active");
    const entry = await createEntry(source.id, `source-active-${randomUUID()}`);

    const archived = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${entry.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);

    const created = await createEntry(source.id, `new-entry-${randomUUID()}`, "New entry after archive");
    expect(created.status).toBe("active");
    expect(created.source_id).toBe(source.id);
  });

  it("returns 404 for unknown knowledge entries", async () => {
    const missing = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${randomUUID()}/archive`,
    });
    expect(missing.statusCode).toBe(404);
  });
});
