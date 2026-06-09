import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";

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

async function createTask(title = "Knowledge Task"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: `${title} ${randomUUID()}`,
      content_type: "article",
      priority: "normal",
      requirement_data: { schema_version: 1, summary: "knowledge test" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

async function createSource(name = "Docs") {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `${name} ${randomUUID()}`,
      source_type: "document",
      uri: `kb://docs/${randomUUID()}`,
      metadata: { team: "content" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("Product Gap 4 Knowledge/RAG Backend MVP", () => {
  it("creates knowledge sources and entries", async () => {
    const source = await createSource();
    expect(source).toMatchObject({
      project_id: DEFAULT_PROJECT_ID,
      source_type: "document",
      status: "active",
      created_by: DEFAULT_USER_ID,
    });

    const entry = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/entries`,
      payload: {
        title: "Spring campaign brief",
        body: "Audience research says short educational posts convert best for WeChat readers.",
        tags: ["campaign", "wechat"],
        metadata: { locale: "zh-CN" },
      },
    });
    expect(entry.statusCode).toBe(201);
    expect(entry.json()).toMatchObject({
      source_id: source.id,
      project_id: DEFAULT_PROJECT_ID,
      title: "Spring campaign brief",
      status: "active",
      tags: ["campaign", "wechat"],
    });
  });

  it("searches active entries with deterministic keyword matching", async () => {
    const token = `wechat-${randomUUID()}`;
    const source = await createSource("Search Docs");
    await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/entries`,
      payload: {
        title: "WeChat publishing checklist",
        body: `Use approved asset versions, verify preview links, and keep compliance notes for ${token}.`,
        tags: [token, "publish"],
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/entries`,
      payload: {
        title: "Podcast outline",
        body: "A voice-first outline for weekly show notes.",
        tags: ["audio"],
      },
    });

    const search = await app.inject({
      method: "GET",
      url: `/api/knowledge/search?q=${token}&limit=5`,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toMatchObject({
      query: token,
      items: [
        expect.objectContaining({
          title: "WeChat publishing checklist",
          source_id: source.id,
        }),
      ],
    });
    expect(search.json().items).toHaveLength(1);
  });

  it("returns task context candidates without creating context packs", async () => {
    const token = `research-${randomUUID()}`;
    const source = await createSource("Task Context");
    await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/entries`,
      payload: {
        title: "Research source hygiene",
        body: `Keep source references explicit when building ${token} reports for a content task.`,
        tags: [token],
      },
    });
    const taskId = await createTask("Research Context");

    const candidates = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/knowledge-candidates?q=${token}&limit=3`,
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toMatchObject({
      task_id: taskId,
      query: token,
      items: [
        expect.objectContaining({
          title: "Research source hygiene",
          reason: "keyword_match",
        }),
      ],
    });
  });

  it("archives sources and blocks new entries for archived sources", async () => {
    const source = await createSource("Archive Docs");
    const archived = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().status).toBe("archived");

    const blocked = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${source.id}/entries`,
      payload: {
        title: "Blocked entry",
        body: "This should not be accepted once the source is archived.",
        tags: [],
      },
    });
    expect(blocked.statusCode).toBe(409);
  });
});
