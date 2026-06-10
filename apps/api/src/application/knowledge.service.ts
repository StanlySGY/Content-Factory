import type {
  CreateKnowledgeEntryBody,
  CreateKnowledgeSourceBody,
  KnowledgeSearchQuery,
} from "@cf/shared";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  assertKnowledgeSourceActive,
  normalizeKnowledgeLimit,
  normalizeKnowledgeQuery,
  normalizeTags,
  validateKnowledgeEntry,
  validateKnowledgeSource,
} from "../domain/knowledge/knowledge.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { KnowledgeEntryRow, KnowledgeSourceRow } from "../infrastructure/db/schema.js";
import * as repo from "../infrastructure/repositories/knowledge.repository.js";
import type { RequestContext } from "./task.service.js";

export interface KnowledgeSearchResult {
  query: string;
  items: Array<KnowledgeEntryRow & { reason: "keyword_match" }>;
}

export interface TaskKnowledgeCandidatesResult extends KnowledgeSearchResult {
  taskId: string;
}

export class KnowledgeService {
  constructor(private readonly db: Db) {}

  createSource(ctx: RequestContext, input: CreateKnowledgeSourceBody): Promise<KnowledgeSourceRow> {
    validateKnowledgeSource(input);
    const actorId = this.requireActor(ctx);
    return runInProject(this.db, ctx.projectId, (tx) =>
      repo.createSource(tx, {
        project_id: ctx.projectId,
        name: input.name,
        source_type: input.source_type,
        uri: input.uri ?? null,
        metadata: input.metadata ?? {},
        created_by: actorId,
      }),
    );
  }

  createEntry(
    ctx: RequestContext,
    sourceId: string,
    input: CreateKnowledgeEntryBody,
  ): Promise<KnowledgeEntryRow> {
    validateKnowledgeEntry(input);
    const actorId = this.requireActor(ctx);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const source = await repo.getSource(tx, ctx.projectId, sourceId);
      if (!source) throw new NotFoundError(`knowledge_source ${sourceId} not found`);
      assertKnowledgeSourceActive(source.status);
      return repo.createEntry(tx, {
        project_id: ctx.projectId,
        source_id: sourceId,
        title: input.title,
        body: input.body,
        tags: normalizeTags(input.tags),
        metadata: input.metadata ?? {},
        created_by: actorId,
      });
    });
  }

  async archiveSource(ctx: RequestContext, sourceId: string): Promise<KnowledgeSourceRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      repo.archiveSource(tx, ctx.projectId, sourceId),
    );
    if (!row) throw new NotFoundError(`knowledge_source ${sourceId} not found`);
    return row;
  }

  async archiveEntry(ctx: RequestContext, entryId: string): Promise<KnowledgeEntryRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      repo.archiveEntry(tx, ctx.projectId, entryId),
    );
    if (!row) throw new NotFoundError(`knowledge_entry ${entryId} not found`);
    return row;
  }

  async restoreEntry(ctx: RequestContext, entryId: string): Promise<KnowledgeEntryRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const entry = await repo.getEntry(tx, ctx.projectId, entryId);
      if (!entry) throw new NotFoundError(`knowledge_entry ${entryId} not found`);
      const source = await repo.getSource(tx, ctx.projectId, entry.sourceId);
      if (!source) throw new NotFoundError(`knowledge_source ${entry.sourceId} not found`);
      assertKnowledgeSourceActive(source.status);
      const restored = await repo.restoreEntry(tx, ctx.projectId, entryId);
      if (!restored) throw new NotFoundError(`knowledge_entry ${entryId} not found`);
      return restored;
    });
  }

  async search(ctx: RequestContext, query: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
    const normalizedQuery = normalizeKnowledgeQuery(query.q);
    const limit = normalizeKnowledgeLimit(query.limit);
    const rows = await runInProject(this.db, ctx.projectId, (tx) =>
      repo.searchEntries(tx, ctx.projectId, normalizedQuery, limit),
    );
    return { query: normalizedQuery, items: rows.map(withKeywordReason) };
  }

  async taskCandidates(
    ctx: RequestContext,
    taskId: string,
    query: KnowledgeSearchQuery,
  ): Promise<TaskKnowledgeCandidatesResult> {
    const normalizedQuery = normalizeKnowledgeQuery(query.q);
    const limit = normalizeKnowledgeLimit(query.limit);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (!(await repo.taskExists(tx, ctx.projectId, taskId)))
        throw new NotFoundError(`content_task ${taskId} not found in project`);
      const rows = await repo.searchEntries(tx, ctx.projectId, normalizedQuery, limit);
      return { taskId, query: normalizedQuery, items: rows.map(withKeywordReason) };
    });
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("knowledge operation requires an actor");
    return ctx.actorId;
  }
}

function withKeywordReason(row: KnowledgeEntryRow): KnowledgeEntryRow & { reason: "keyword_match" } {
  return { ...row, reason: "keyword_match" };
}
