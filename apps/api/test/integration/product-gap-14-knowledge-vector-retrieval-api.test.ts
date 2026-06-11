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

async function createSource() {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `Vector Source ${randomUUID()}`,
      source_type: "document",
      uri: `kb://vector/${randomUUID()}`,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, input: { title: string; body: string; tags: string[] }) {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: input,
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("Product Gap 14 Knowledge local vector retrieval Backend MVP", () => {
  it("returns active embedded entries ranked by deterministic local vector similarity", async () => {
    const source = await createSource();
    const launchEntry = await createEntry(source.id, {
      title: "Launch approval playbook",
      body: "Release sequencing requires approval evidence, channel readiness checks, and rollback notes.",
      tags: ["release", "approval", "sequencing"],
    });
    await createEntry(source.id, {
      title: "Billing glossary",
      body: "Invoice reconciliation terms, payment aging, revenue recognition, and finance handoff notes.",
      tags: ["finance", "billing"],
    });
    const archivedEntry = await createEntry(source.id, {
      title: "Archived launch memo",
      body: "Old release sequencing memo that should not be returned once archived.",
      tags: ["release", "archived"],
    });
    const archive = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${archivedEntry.id}/archive`,
    });
    expect(archive.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/api/knowledge/vector-search?q=release%20approval%20sequencing&limit=2",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      mode: "knowledge_vector_search",
      query: "release approval sequencing",
      provider: "local_hash_v1",
      dimensions: 16,
      external_calls_performed: false,
      vector_index_integrated: false,
    });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: launchEntry.id,
      reason: "local_vector_similarity",
    });
    expect(body.items.map((item: { id: string }) => item.id)).not.toContain(archivedEntry.id);
    expect(body.items[0].similarity_score).toBeGreaterThanOrEqual(body.items[1].similarity_score);
  });
});
