import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import {
  mcpMarketplaceEntries,
  mcpMarketplaceInstallations,
  mcpServers,
  mcpTools,
  toolInvocations,
} from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>;
let db: Db;

const marketplaceEntryBody = (slug = `entry-${randomUUID()}`) => ({
  slug,
  manifest: {
    server_ref: `mcp://${slug}`,
    display_name: "Docs Search",
    endpoint: "https://mcp.example.test/rpc",
    tools: [
      { name: "search_docs", description: "Search documentation" },
      { name: "read_doc", description: "Read one document" },
    ],
  },
});

const createEntry = async (slug?: string) => {
  const res = await app.inject({
    method: "POST",
    url: "/api/mcp/marketplace/entries",
    payload: marketplaceEntryBody(slug),
  });
  expect(res.statusCode).toBe(201);
  return res.json();
};

const installEntry = (entryId: string) =>
  app.inject({
    method: "POST",
    url: `/api/mcp/marketplace/entries/${entryId}/install`,
  });

beforeAll(async () => {
  const env = loadEnv();
  built = await buildApp(env, { logger: false });
  app = built.app;
  await app.ready();
  pool = createPool(env.databaseUrl);
  db = createDb(pool);
});

afterAll(async () => {
  await pool.end();
  await built.close();
});

describe("MCP Marketplace Backend MVP", () => {
  it("rejects invalid marketplace manifest", async () => {
    const badServerRef = await app.inject({
      method: "POST",
      url: "/api/mcp/marketplace/entries",
      payload: {
        slug: `bad-${randomUUID()}`,
        manifest: {
          server_ref: "server://not-mcp",
          display_name: "Bad",
          endpoint: "https://mcp.example.test/rpc",
          tools: [{ name: "read" }],
        },
      },
    });
    expect(badServerRef.statusCode).toBe(400);

    const duplicateTools = await app.inject({
      method: "POST",
      url: "/api/mcp/marketplace/entries",
      payload: {
        slug: `dup-${randomUUID()}`,
        manifest: {
          server_ref: "mcp://duplicate-tools",
          display_name: "Bad",
          endpoint: "https://mcp.example.test/rpc",
          tools: [{ name: "read" }, { name: "read" }],
        },
      },
    });
    expect(duplicateTools.statusCode).toBe(400);
  });

  it("enforces unique entry slug and lists entries", async () => {
    const slug = `unique-${randomUUID()}`;
    const entry = await createEntry(slug);
    expect(entry.slug).toBe(slug);
    expect(entry.manifest.server_ref).toBe(`mcp://${slug}`);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/mcp/marketplace/entries",
      payload: marketplaceEntryBody(slug),
    });
    expect(duplicate.statusCode).toBe(409);

    const listed = await app.inject({ method: "GET", url: "/api/mcp/marketplace/entries" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((e: { id: string }) => e.id === entry.id)).toBe(true);
  });

  it("installs an entry into the current project by creating an MCP server and tools without invocation side effects", async () => {
    const entry = await createEntry();
    const beforeInvocations = (await db.select({ value: count() }).from(toolInvocations))[0]!.value;

    const installed = await installEntry(entry.id);
    expect(installed.statusCode).toBe(201);
    expect(installed.json()).toMatchObject({
      entry_id: entry.id,
      status: "installed",
    });
    expect(installed.json().mcp_server_id).toEqual(expect.any(String));

    const serverRows = await db.select().from(mcpServers).where(eq(mcpServers.id, installed.json().mcp_server_id));
    expect(serverRows).toHaveLength(1);
    expect(serverRows[0]!.name).toBe(entry.manifest.display_name);
    expect(serverRows[0]!.endpoint).toBe(entry.manifest.endpoint);

    const toolRows = await db.select().from(mcpTools).where(eq(mcpTools.mcpServerId, installed.json().mcp_server_id));
    expect(toolRows.map((tool) => tool.name).sort()).toEqual(["read_doc", "search_docs"]);
    expect(toolRows.every((tool) => tool.enabled)).toBe(true);

    const afterInvocations = (await db.select({ value: count() }).from(toolInvocations))[0]!.value;
    expect(afterInvocations).toBe(beforeInvocations);
  });

  it("blocks duplicate active install, then supports disable and uninstall transitions", async () => {
    const entry = await createEntry();
    const installed = await installEntry(entry.id);
    expect(installed.statusCode).toBe(201);

    const duplicateInstall = await installEntry(entry.id);
    expect(duplicateInstall.statusCode).toBe(409);

    const disabled = await app.inject({
      method: "POST",
      url: `/api/mcp/marketplace/installations/${installed.json().id}/disable`,
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().status).toBe("disabled");

    const duplicateWhileDisabled = await installEntry(entry.id);
    expect(duplicateWhileDisabled.statusCode).toBe(409);

    const uninstalled = await app.inject({
      method: "POST",
      url: `/api/mcp/marketplace/installations/${installed.json().id}/uninstall`,
    });
    expect(uninstalled.statusCode).toBe(200);
    expect(uninstalled.json().status).toBe("uninstalled");

    const reinstall = await installEntry(entry.id);
    expect(reinstall.statusCode).toBe(201);
    expect(reinstall.json().id).not.toBe(installed.json().id);

    const listed = await app.inject({
      method: "GET",
      url: `/api/mcp/marketplace/installations?project_id=${reinstall.json().project_id}`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().map((row: { entry_id: string; status: string }) => [row.entry_id, row.status])).toEqual(
      expect.arrayContaining([[entry.id, "uninstalled"], [entry.id, "installed"]]),
    );

    const persistedEntries = await db.select().from(mcpMarketplaceEntries).where(eq(mcpMarketplaceEntries.id, entry.id));
    const persistedInstallations = await db
      .select()
      .from(mcpMarketplaceInstallations)
      .where(eq(mcpMarketplaceInstallations.entryId, entry.id));
    expect(persistedEntries).toHaveLength(1);
    expect(persistedInstallations.length).toBeGreaterThanOrEqual(2);
  });
});
