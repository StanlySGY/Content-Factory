import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_PROJECT_ID, loadEnv } from "../../src/config/env.js";

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

async function createTask(title = "Knowledge Context Pack Task"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: `${title} ${randomUUID()}`,
      content_type: "article",
      priority: "normal",
      requirement_data: { schema_version: 1, summary: "knowledge context pack test" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

async function createSource(name = "Knowledge Context Source") {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `${name} ${randomUUID()}`,
      source_type: "document",
      uri: `kb://context/${randomUUID()}`,
      metadata: { purpose: "materialization" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, token: string, title: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: {
      title,
      body: `Use this ${token} reference when preparing context material.`,
      tags: [token, "context"],
      metadata: { section: title },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("Product Gap 8 Knowledge Context Pack Materialization Backend MVP", () => {
  it("materializes keyword knowledge candidates into a task-scoped context pack", async () => {
    const token = `ctx-${randomUUID()}`;
    const taskId = await createTask();
    const source = await createSource();
    const first = await createEntry(source.id, token, "Materialized research note");
    const second = await createEntry(source.id, token, "Materialized publish note");

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/knowledge-context-pack`,
      payload: { q: token, limit: 5, version: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      content_task_id: taskId,
      stage_run_id: null,
      version: 1,
      scope: "task",
      sensitivity_level: "internal",
      data: {
        materialized_from: "knowledge_entries",
        query: token,
      },
      source_refs: {
        knowledge_entry_ids: expect.arrayContaining([first.id, second.id]),
        knowledge_source_ids: [source.id],
      },
    });
    expect(response.json().data.knowledge_entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, title: "Materialized research note", reason: "keyword_match" }),
        expect.objectContaining({ id: second.id, title: "Materialized publish note", reason: "keyword_match" }),
      ]),
    );

    const packs = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/context-packs` });
    expect(packs.statusCode).toBe(200);
    expect(packs.json()).toContainEqual(expect.objectContaining({ id: response.json().id }));
  });

  it("rejects materialization for unknown tasks and empty candidate sets", async () => {
    const missing = await app.inject({
      method: "POST",
      url: `/api/tasks/${randomUUID()}/knowledge-context-pack`,
      payload: { q: "missing", limit: 3, version: 1 },
    });
    expect(missing.statusCode).toBe(404);

    const taskId = await createTask("Empty Context Pack");
    const empty = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/knowledge-context-pack`,
      payload: { q: `no-hit-${randomUUID()}`, limit: 3, version: 1 },
    });
    expect(empty.statusCode).toBe(404);
  });

  it("does not mutate knowledge entries when materializing a context pack", async () => {
    const token = `immutable-${randomUUID()}`;
    const taskId = await createTask("Immutable Knowledge");
    const source = await createSource("Immutable Source");
    const entry = await createEntry(source.id, token, "Immutable entry");

    const before = await app.inject({ method: "GET", url: `/api/knowledge/search?q=${token}&limit=1` });
    expect(before.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/knowledge-context-pack`,
      payload: { q: token, limit: 1, version: 1 },
    });
    expect(response.statusCode).toBe(201);

    const after = await app.inject({ method: "GET", url: `/api/knowledge/search?q=${token}&limit=1` });
    expect(after.statusCode).toBe(200);
    expect(after.json().items).toEqual(before.json().items);
    expect(after.json().items[0]).toMatchObject({ id: entry.id, project_id: DEFAULT_PROJECT_ID });
  });
});
