import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  assertMcpMarketplaceInstallationTransition,
  validateMcpMarketplaceManifest,
  type McpMarketplaceManifest,
} from "../domain/mcp/marketplace.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { McpMarketplaceEntryRow, McpMarketplaceInstallationRow } from "../infrastructure/db/schema.js";
import * as marketplaceRepo from "../infrastructure/repositories/mcp-marketplace.repository.js";
import type { RequestContext } from "./task.service.js";

type JsonRecord = Record<string, unknown>;

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";

export interface CreateMcpMarketplaceEntryInput {
  slug: string;
  manifest: JsonRecord;
}

export class McpMarketplaceService {
  constructor(private readonly db: Db) {}

  async createEntry(input: CreateMcpMarketplaceEntryInput): Promise<McpMarketplaceEntryRow> {
    const manifest = validateMcpMarketplaceManifest(input.manifest);
    try {
      return await marketplaceRepo.createEntry(this.db, {
        slug: input.slug,
        manifest,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`mcp marketplace entry slug already exists: ${input.slug}`);
      throw error;
    }
  }

  listEntries(): Promise<McpMarketplaceEntryRow[]> {
    return marketplaceRepo.listEntries(this.db);
  }

  async installEntry(ctx: RequestContext, entryId: string): Promise<McpMarketplaceInstallationRow> {
    const installedBy = this.requireActor(ctx);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const entry = await marketplaceRepo.getEntry(tx, entryId);
      if (!entry) throw new NotFoundError(`mcp marketplace entry ${entryId} not found`);
      const existing = await marketplaceRepo.findActiveInstallation(tx, ctx.projectId, entry.id);
      if (existing) throw new ConflictError(`mcp marketplace entry ${entryId} is already installed in this project`);

      const manifest = validateMcpMarketplaceManifest(entry.manifest) as McpMarketplaceManifest;
      const server = await this.findOrCreateServer(tx, ctx.projectId, installedBy, manifest);
      for (const tool of manifest.tools) {
        await marketplaceRepo.createToolIfMissing(tx, server.id, {
          name: tool.name,
          description: typeof tool.description === "string" ? tool.description : null,
          manifest: {
            ...tool,
            marketplace_entry_id: entry.id,
            server_ref: manifest.server_ref,
          },
        });
      }

      try {
        return await marketplaceRepo.createInstallation(tx, {
          project_id: ctx.projectId,
          entry_id: entry.id,
          mcp_server_id: server.id,
          status: "installed",
          installed_by: installedBy,
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ConflictError(`mcp marketplace entry ${entryId} is already installed in this project`);
        throw error;
      }
    });
  }

  async listInstallationsByProject(ctx: RequestContext, projectId?: string): Promise<McpMarketplaceInstallationRow[]> {
    if (projectId && projectId !== ctx.projectId) throw new NotFoundError(`project ${projectId} not found`);
    return runInProject(this.db, ctx.projectId, (tx) =>
      marketplaceRepo.listInstallationsByProject(tx, ctx.projectId),
    );
  }

  disableInstallation(ctx: RequestContext, id: string): Promise<McpMarketplaceInstallationRow> {
    return this.transitionInstallation(ctx, id, "disabled");
  }

  uninstallInstallation(ctx: RequestContext, id: string): Promise<McpMarketplaceInstallationRow> {
    return this.transitionInstallation(ctx, id, "uninstalled");
  }

  private async transitionInstallation(
    ctx: RequestContext,
    id: string,
    status: "disabled" | "uninstalled",
  ): Promise<McpMarketplaceInstallationRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await marketplaceRepo.getInstallation(tx, ctx.projectId, id);
      if (!current) throw new NotFoundError(`mcp marketplace installation ${id} not found`);
      assertMcpMarketplaceInstallationTransition(current.status as "installed" | "disabled" | "uninstalled", status);
      const updated = await marketplaceRepo.updateInstallationStatus(tx, ctx.projectId, id, status);
      if (!updated) throw new NotFoundError(`mcp marketplace installation ${id} not found`);
      return updated;
    });
  }

  private async findOrCreateServer(
    tx: Db,
    projectId: string,
    actorId: string,
    manifest: McpMarketplaceManifest,
  ) {
    const existing = await marketplaceRepo.findServerByEndpoint(tx, projectId, manifest.endpoint);
    if (existing) return existing;
    return marketplaceRepo.createMarketplaceServer(tx, projectId, {
      name: manifest.display_name,
      endpoint: manifest.endpoint,
      created_by: actorId,
    });
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("mcp marketplace installation requires an actor");
    return ctx.actorId;
  }
}
