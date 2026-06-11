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
      name: `Embedding Source ${randomUUID()}`,
      source_type: "document",
      uri: `kb://embedding/${randomUUID()}`,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, label: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: {
      title: `Embedding ${label}`,
      body: `Deterministic local embedding coverage for ${label} ${randomUUID()}.`,
      tags: ["embedding", label],
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("Product Gap 13 Knowledge embedding pipeline Backend MVP", () => {
  it("generates deterministic local embeddings for active knowledge entries", async () => {
    const source = await createSource();
    await createEntry(source.id, "alpha");
    await createEntry(source.id, "beta");

    const readiness = await app.inject({
      method: "GET",
      url: "/api/knowledge/embedding-readiness",
    });

    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      mode: "knowledge_embedding_readiness",
      ready: true,
      status: "ready",
      provider: "local_hash_v1",
      dimensions: 16,
      missing_embeddings: 0,
      external_calls_performed: false,
      vector_index_integrated: false,
    });
    expect(readiness.json().active_entries_total).toBeGreaterThanOrEqual(2);
    expect(readiness.json().embedded_active_entries).toBe(readiness.json().active_entries_total);
  });
});
