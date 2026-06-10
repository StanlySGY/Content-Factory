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

async function createSource(name = "Knowledge Inventory Source", sourceType = "document") {
  const response = await app.inject({
    method: "POST",
    url: "/api/knowledge/sources",
    payload: {
      name: `${name} ${randomUUID()}`,
      source_type: sourceType,
      uri: `kb://inventory/${randomUUID()}`,
      metadata: { purpose: "inventory" },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEntry(sourceId: string, title = "Inventory entry", status: "active" | "archived" = "active") {
  const token = `inventory-${randomUUID()}`;
  const response = await app.inject({
    method: "POST",
    url: `/api/knowledge/sources/${sourceId}/entries`,
    payload: {
      title,
      body: `Inventory body ${token}`,
      tags: [token, "inventory"],
      metadata: { section: title },
    },
  });
  expect(response.statusCode).toBe(201);
  const entry = response.json();
  if (status === "archived") {
    const archived = await app.inject({
      method: "POST",
      url: `/api/knowledge/entries/${entry.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);
    return archived.json();
  }
  return entry;
}

describe("Product Gap 12 Knowledge Inventory Read API Backend MVP", () => {
  it("lists knowledge sources with optional status and source_type filters", async () => {
    const activeDocument = await createSource("Inventory Active Document", "document");
    const archivedUrl = await createSource("Inventory Archived URL", "url");
    const archived = await app.inject({
      method: "POST",
      url: `/api/knowledge/sources/${archivedUrl.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);

    const allSources = await app.inject({
      method: "GET",
      url: "/api/knowledge/sources",
    });
    expect(allSources.statusCode).toBe(200);
    expect(allSources.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeDocument.id, status: "active", source_type: "document" }),
        expect.objectContaining({ id: archivedUrl.id, status: "archived", source_type: "url" }),
      ]),
    );

    const archivedUrls = await app.inject({
      method: "GET",
      url: "/api/knowledge/sources?status=archived&source_type=url",
    });
    expect(archivedUrls.statusCode).toBe(200);
    expect(archivedUrls.json()).toContainEqual(
      expect.objectContaining({ id: archivedUrl.id, status: "archived", source_type: "url" }),
    );
    expect(archivedUrls.json()).not.toContainEqual(expect.objectContaining({ id: activeDocument.id }));
  });

  it("gets a knowledge source and lists its entries including archived inventory rows", async () => {
    const source = await createSource("Inventory Detail Source");
    const activeEntry = await createEntry(source.id, "Inventory active entry");
    const archivedEntry = await createEntry(source.id, "Inventory archived entry", "archived");

    const detail = await app.inject({
      method: "GET",
      url: `/api/knowledge/sources/${source.id}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: source.id,
      status: "active",
    });

    const entries = await app.inject({
      method: "GET",
      url: `/api/knowledge/sources/${source.id}/entries`,
    });
    expect(entries.statusCode).toBe(200);
    expect(entries.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeEntry.id, status: "active" }),
        expect.objectContaining({ id: archivedEntry.id, status: "archived" }),
      ]),
    );

    const archivedEntries = await app.inject({
      method: "GET",
      url: `/api/knowledge/sources/${source.id}/entries?status=archived`,
    });
    expect(archivedEntries.statusCode).toBe(200);
    expect(archivedEntries.json()).toEqual([
      expect.objectContaining({ id: archivedEntry.id, status: "archived" }),
    ]);
  });

  it("returns 404 for unknown source detail and entry inventory", async () => {
    const missingId = randomUUID();
    const detail = await app.inject({
      method: "GET",
      url: `/api/knowledge/sources/${missingId}`,
    });
    expect(detail.statusCode).toBe(404);

    const entries = await app.inject({
      method: "GET",
      url: `/api/knowledge/sources/${missingId}/entries`,
    });
    expect(entries.statusCode).toBe(404);
  });
});
