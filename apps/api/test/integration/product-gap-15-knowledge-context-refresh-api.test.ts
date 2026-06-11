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

async function createTask(title = "Knowledge Refresh Task"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: `${title} ${randomUUID()}`,
      content_type: "article",
      priority: "normal",
      requirement_data: { schema_version: 1, summary: "knowledge refresh test" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

async function createSource() {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `Refresh Source ${randomUUID()}`,
      source_type: "document",
      uri: `kb://refresh/${randomUUID()}`,
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
      body: `Use ${token} material for context refresh coverage.`,
      tags: [token, "refresh"],
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function materialize(taskId: string, token: string, version = 1) {
  const response = await app.inject({
    method: "POST",
    url: `/api/tasks/${taskId}/knowledge-context-pack`,
    payload: { q: token, limit: 5, version },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function listPacks(taskId: string) {
  const response = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/context-packs` });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe("Product Gap 15 Knowledge context pack refresh policy Backend MVP", () => {
  it("appends a refreshed context pack version when a matching knowledge entry is created", async () => {
    const token = `refresh-create-${randomUUID()}`;
    const taskId = await createTask();
    const source = await createSource();
    const first = await createEntry(source.id, token, "Initial refresh note");
    await materialize(taskId, token);

    const second = await createEntry(source.id, token, "New refresh note");

    const packs = await listPacks(taskId);
    expect(packs.map((pack: { version: number }) => pack.version)).toEqual([1, 2]);
    expect(packs[1]).toMatchObject({
      version: 2,
      data: {
        materialized_from: "knowledge_entries",
        query: token,
        refresh_policy: "on_knowledge_change",
        refreshed_from_version: 1,
      },
      source_refs: {
        knowledge_entry_ids: expect.arrayContaining([first.id, second.id]),
      },
    });
  });

  it("appends a refreshed context pack version when a referenced knowledge entry is archived", async () => {
    const token = `refresh-archive-${randomUUID()}`;
    const taskId = await createTask("Knowledge Archive Refresh Task");
    const source = await createSource();
    const kept = await createEntry(source.id, token, "Kept refresh note");
    const archived = await createEntry(source.id, token, "Archived refresh note");
    await materialize(taskId, token);

    const archive = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${archived.id}/archive`,
    });
    expect(archive.statusCode).toBe(200);

    const packs = await listPacks(taskId);
    expect(packs.map((pack: { version: number }) => pack.version)).toEqual([1, 2]);
    expect(packs[1]).toMatchObject({
      version: 2,
      data: {
        refresh_policy: "on_knowledge_change",
        refreshed_from_version: 1,
      },
      source_refs: {
        knowledge_entry_ids: [kept.id],
      },
    });
    expect(packs[1].source_refs.knowledge_entry_ids).not.toContain(archived.id);
  });
});
