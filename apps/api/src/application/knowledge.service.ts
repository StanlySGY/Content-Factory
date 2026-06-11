import type {
  CreateKnowledgeEntryBody,
  CreateKnowledgeSourceBody,
  ListKnowledgeEntriesQuery,
  ListKnowledgeSourcesQuery,
  KnowledgeSearchQuery,
} from "@cf/shared";
import {
  buildKnowledgeContextPackPayload,
  createContextPack,
} from "../domain/context-pack/context-pack.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  buildLocalKnowledgeEmbedding,
  calculateLocalKnowledgeVectorSimilarity,
  LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS,
  LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER,
} from "../domain/knowledge/embedding.js";
import {
  assertKnowledgeSourceActive,
  normalizeKnowledgeLimit,
  normalizeKnowledgeQuery,
  normalizeTags,
  validateKnowledgeEntry,
  validateKnowledgeSource,
} from "../domain/knowledge/knowledge.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { ContextPackRow, KnowledgeEntryRow, KnowledgeSourceRow } from "../infrastructure/db/schema.js";
import * as contextRepo from "../infrastructure/repositories/context-pack.repository.js";
import * as repo from "../infrastructure/repositories/knowledge.repository.js";
import type { RequestContext } from "./task.service.js";

export interface KnowledgeSearchResult {
  query: string;
  items: Array<KnowledgeEntryRow & { reason: "keyword_match" }>;
}

export interface TaskKnowledgeCandidatesResult extends KnowledgeSearchResult {
  taskId: string;
}

export interface KnowledgeVectorSearchResult {
  mode: "knowledge_vector_search";
  query: string;
  provider: string;
  dimensions: number;
  externalCallsPerformed: false;
  vectorIndexIntegrated: false;
  items: Array<KnowledgeEntryRow & {
    reason: "local_vector_similarity";
    similarityScore: number;
  }>;
}

export interface KnowledgeEmbeddingReadiness {
  mode: "knowledge_embedding_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  provider: string;
  dimensions: number;
  activeEntriesTotal: number;
  embeddedActiveEntries: number;
  missingEmbeddings: number;
  externalCallsPerformed: false;
  vectorIndexIntegrated: false;
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
      const entry = await repo.createEntry(tx, {
        project_id: ctx.projectId,
        source_id: sourceId,
        title: input.title,
        body: input.body,
        tags: normalizeTags(input.tags),
        metadata: input.metadata ?? {},
        created_by: actorId,
      });
      const embedding = buildLocalKnowledgeEmbedding({
        title: entry.title,
        body: entry.body,
        tags: entry.tags,
      });
      await repo.createEntryEmbedding(tx, {
        project_id: ctx.projectId,
        knowledge_entry_id: entry.id,
        provider: embedding.provider,
        dimensions: embedding.dimensions,
        vector: embedding.vector,
        text_hash: embedding.textHash,
      });
      await refreshMaterializedKnowledgeContextPacks(tx, ctx.projectId);
      return entry;
    });
  }

  async archiveSource(ctx: RequestContext, sourceId: string): Promise<KnowledgeSourceRow> {
    const row = await runInProject(this.db, ctx.projectId, async (tx) => {
      const archived = await repo.archiveSource(tx, ctx.projectId, sourceId);
      if (archived) await refreshMaterializedKnowledgeContextPacks(tx, ctx.projectId);
      return archived;
    });
    if (!row) throw new NotFoundError(`knowledge_source ${sourceId} not found`);
    return row;
  }

  listSources(ctx: RequestContext, query: ListKnowledgeSourcesQuery): Promise<KnowledgeSourceRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      repo.listSources(tx, ctx.projectId, {
        status: query.status,
        source_type: query.source_type,
      }),
    );
  }

  async getSource(ctx: RequestContext, sourceId: string): Promise<KnowledgeSourceRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      repo.getSource(tx, ctx.projectId, sourceId),
    );
    if (!row) throw new NotFoundError(`knowledge_source ${sourceId} not found`);
    return row;
  }

  async listEntriesBySource(
    ctx: RequestContext,
    sourceId: string,
    query: ListKnowledgeEntriesQuery,
  ): Promise<KnowledgeEntryRow[]> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const source = await repo.getSource(tx, ctx.projectId, sourceId);
      if (!source) throw new NotFoundError(`knowledge_source ${sourceId} not found`);
      return repo.listEntriesBySource(tx, ctx.projectId, sourceId, { status: query.status });
    });
  }

  async restoreSource(ctx: RequestContext, sourceId: string): Promise<KnowledgeSourceRow> {
    const row = await runInProject(this.db, ctx.projectId, async (tx) => {
      const restored = await repo.restoreSource(tx, ctx.projectId, sourceId);
      if (restored) await refreshMaterializedKnowledgeContextPacks(tx, ctx.projectId);
      return restored;
    });
    if (!row) throw new NotFoundError(`knowledge_source ${sourceId} not found`);
    return row;
  }

  async archiveEntry(ctx: RequestContext, entryId: string): Promise<KnowledgeEntryRow> {
    const row = await runInProject(this.db, ctx.projectId, async (tx) => {
      const archived = await repo.archiveEntry(tx, ctx.projectId, entryId);
      if (archived) await refreshMaterializedKnowledgeContextPacks(tx, ctx.projectId);
      return archived;
    });
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
      await refreshMaterializedKnowledgeContextPacks(tx, ctx.projectId);
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

  async getEmbeddingReadiness(ctx: RequestContext): Promise<KnowledgeEmbeddingReadiness> {
    const coverage = await runInProject(this.db, ctx.projectId, (tx) =>
      repo.getEmbeddingCoverage(tx, ctx.projectId, LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER),
    );
    const missingEmbeddings = coverage.activeEntriesTotal - coverage.embeddedActiveEntries;
    const ready = missingEmbeddings === 0;
    return {
      mode: "knowledge_embedding_readiness",
      ready,
      status: ready ? "ready" : "blocked",
      provider: LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER,
      dimensions: LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS,
      activeEntriesTotal: coverage.activeEntriesTotal,
      embeddedActiveEntries: coverage.embeddedActiveEntries,
      missingEmbeddings,
      externalCallsPerformed: false,
      vectorIndexIntegrated: false,
    };
  }

  async vectorSearch(ctx: RequestContext, query: KnowledgeSearchQuery): Promise<KnowledgeVectorSearchResult> {
    const normalizedQuery = normalizeKnowledgeQuery(query.q);
    const limit = normalizeKnowledgeLimit(query.limit);
    const queryEmbedding = buildLocalKnowledgeEmbedding({
      title: normalizedQuery,
      body: "",
      tags: [],
    });
    const rows = await runInProject(this.db, ctx.projectId, (tx) =>
      repo.listActiveEmbeddedEntries(tx, ctx.projectId, LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER),
    );
    const items = rows
      .map(({ entry, vector }) => ({
        ...entry,
        reason: "local_vector_similarity" as const,
        similarityScore: calculateLocalKnowledgeVectorSimilarity(queryEmbedding.vector, vector),
      }))
      .sort((left, right) => right.similarityScore - left.similarityScore)
      .slice(0, limit);
    return {
      mode: "knowledge_vector_search",
      query: normalizedQuery,
      provider: LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER,
      dimensions: LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS,
      externalCallsPerformed: false,
      vectorIndexIntegrated: false,
      items,
    };
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("knowledge operation requires an actor");
    return ctx.actorId;
  }
}

function withKeywordReason(row: KnowledgeEntryRow): KnowledgeEntryRow & { reason: "keyword_match" } {
  return { ...row, reason: "keyword_match" };
}

async function refreshMaterializedKnowledgeContextPacks(db: Db, projectId: string): Promise<void> {
  const packs = await contextRepo.listTaskScoped(db, projectId);
  const latestByTaskAndQuery = new Map<string, ContextPackRow>();
  for (const pack of packs) {
    const query = getMaterializedKnowledgeQuery(pack);
    if (!query) continue;
    const key = `${pack.contentTaskId}:${query}`;
    const current = latestByTaskAndQuery.get(key);
    if (!current || pack.version > current.version) latestByTaskAndQuery.set(key, pack);
  }

  for (const pack of latestByTaskAndQuery.values()) {
    const query = getMaterializedKnowledgeQuery(pack);
    if (!query) continue;
    const limit = getMaterializedKnowledgeLimit(pack);
    const entries = await repo.searchEntries(db, projectId, query, limit);
    const nextEntryIds = entries.map((entry) => entry.id);
    const currentEntryIds = getKnowledgeEntryIds(pack);
    if (sameOrderedStrings(nextEntryIds, currentEntryIds)) continue;

    const { data, source_refs } = buildKnowledgeContextPackPayload(
      query,
      entries.map((entry) => ({ id: entry.id, title: entry.title, source_id: entry.sourceId })),
    );
    const refreshed = createContextPack({
      content_task_id: pack.contentTaskId,
      stage_run_id: null,
      version: pack.version + 1,
      scope: "task",
      data: {
        ...data,
        limit,
        refresh_policy: "on_knowledge_change",
        refreshed_from_context_pack_id: pack.id,
        refreshed_from_version: pack.version,
      },
      source_refs: {
        ...source_refs,
        refreshed_from_context_pack_id: pack.id,
      },
      sensitivity_level: pack.sensitivityLevel,
    });
    await contextRepo.create(db, projectId, {
      content_task_id: refreshed.content_task_id,
      stage_run_id: refreshed.stage_run_id,
      version: refreshed.version,
      scope: refreshed.scope,
      data: refreshed.data,
      source_refs: refreshed.source_refs,
      sensitivity_level: refreshed.sensitivity_level,
    });
  }
}

function getMaterializedKnowledgeQuery(pack: ContextPackRow): string | null {
  if (pack.scope !== "task") return null;
  if (pack.data.materialized_from !== "knowledge_entries") return null;
  if (typeof pack.data.query !== "string") return null;
  return normalizeKnowledgeQuery(pack.data.query);
}

function getMaterializedKnowledgeLimit(pack: ContextPackRow): number {
  if (typeof pack.data.limit === "number") return normalizeKnowledgeLimit(pack.data.limit);
  const ids = getKnowledgeEntryIds(pack);
  return normalizeKnowledgeLimit(ids.length > 0 ? ids.length : undefined);
}

function getKnowledgeEntryIds(pack: ContextPackRow): string[] {
  const value = pack.sourceRefs.knowledge_entry_ids;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function sameOrderedStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
