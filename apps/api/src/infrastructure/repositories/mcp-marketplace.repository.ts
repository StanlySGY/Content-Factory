import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  mcpMarketplaceEntries,
  mcpMarketplaceInstallations,
  mcpServers,
  mcpTools,
  type McpMarketplaceEntryRow,
  type McpMarketplaceInstallationRow,
  type McpServerRow,
  type McpToolRow,
} from "../db/schema.js";

type JsonRecord = Record<string, unknown>;

export interface McpMarketplaceEntryWrite {
  slug: string;
  manifest: JsonRecord;
}

export interface McpMarketplaceInstallationWrite {
  project_id: string;
  entry_id: string;
  mcp_server_id: string;
  status: string;
  installed_by: string;
}

export async function createEntry(db: Db, input: McpMarketplaceEntryWrite): Promise<McpMarketplaceEntryRow> {
  const [row] = await db.insert(mcpMarketplaceEntries).values({
    slug: input.slug,
    manifest: input.manifest,
  }).returning();
  return row!;
}

export async function getEntry(db: Db, id: string): Promise<McpMarketplaceEntryRow | null> {
  const [row] = await db.select().from(mcpMarketplaceEntries).where(eq(mcpMarketplaceEntries.id, id)).limit(1);
  return row ?? null;
}

export async function listEntries(db: Db): Promise<McpMarketplaceEntryRow[]> {
  return db.select().from(mcpMarketplaceEntries).orderBy(desc(mcpMarketplaceEntries.createdAt));
}

export async function findActiveInstallation(
  db: Db,
  projectId: string,
  entryId: string,
): Promise<McpMarketplaceInstallationRow | null> {
  const [row] = await db
    .select()
    .from(mcpMarketplaceInstallations)
    .where(and(
      eq(mcpMarketplaceInstallations.projectId, projectId),
      eq(mcpMarketplaceInstallations.entryId, entryId),
      inArray(mcpMarketplaceInstallations.status, ["installed", "disabled"]),
    ))
    .limit(1);
  return row ?? null;
}

export async function listInstallationsByProject(
  db: Db,
  projectId: string,
): Promise<McpMarketplaceInstallationRow[]> {
  return db
    .select()
    .from(mcpMarketplaceInstallations)
    .where(eq(mcpMarketplaceInstallations.projectId, projectId))
    .orderBy(desc(mcpMarketplaceInstallations.installedAt));
}

export async function getInstallation(
  db: Db,
  projectId: string,
  id: string,
): Promise<McpMarketplaceInstallationRow | null> {
  const [row] = await db
    .select()
    .from(mcpMarketplaceInstallations)
    .where(and(eq(mcpMarketplaceInstallations.id, id), eq(mcpMarketplaceInstallations.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function createInstallation(
  db: Db,
  input: McpMarketplaceInstallationWrite,
): Promise<McpMarketplaceInstallationRow> {
  const [row] = await db.insert(mcpMarketplaceInstallations).values({
    projectId: input.project_id,
    entryId: input.entry_id,
    mcpServerId: input.mcp_server_id,
    status: input.status,
    installedBy: input.installed_by,
  }).returning();
  return row!;
}

export async function updateInstallationStatus(
  db: Db,
  projectId: string,
  id: string,
  status: string,
): Promise<McpMarketplaceInstallationRow | null> {
  const [row] = await db
    .update(mcpMarketplaceInstallations)
    .set({ status, updatedAt: sql`now()` })
    .where(and(eq(mcpMarketplaceInstallations.id, id), eq(mcpMarketplaceInstallations.projectId, projectId)))
    .returning();
  return row ?? null;
}

export async function findServerByEndpoint(
  db: Db,
  projectId: string,
  endpoint: string,
): Promise<McpServerRow | null> {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.projectId, projectId), eq(mcpServers.endpoint, endpoint)))
    .limit(1);
  return row ?? null;
}

export async function createMarketplaceServer(
  db: Db,
  projectId: string,
  input: {
    name: string;
    endpoint: string;
    created_by: string;
  },
): Promise<McpServerRow> {
  const [row] = await db.insert(mcpServers).values({
    projectId,
    name: input.name,
    description: "Installed from MCP Marketplace",
    endpoint: input.endpoint,
    status: "active",
    riskLevel: "medium",
    createdBy: input.created_by,
  }).returning();
  return row!;
}

export async function listToolsByServer(db: Db, serverId: string): Promise<McpToolRow[]> {
  return db.select().from(mcpTools).where(eq(mcpTools.mcpServerId, serverId));
}

export async function createToolIfMissing(
  db: Db,
  serverId: string,
  tool: { name: string; description?: string | null; manifest: JsonRecord },
): Promise<McpToolRow> {
  const [existing] = await db
    .select()
    .from(mcpTools)
    .where(and(eq(mcpTools.mcpServerId, serverId), eq(mcpTools.name, tool.name)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(mcpTools).values({
    mcpServerId: serverId,
    name: tool.name,
    description: tool.description ?? null,
    manifest: tool.manifest,
    enabled: true,
  }).returning();
  return row!;
}
