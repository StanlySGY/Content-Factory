import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
} from "@cf/shared";
import { ConflictError, ValidationError } from "../errors.js";

function assertIn<T extends readonly string[]>(values: T, value: string, field: string): asserts value is T[number] {
  if (!values.includes(value)) throw new ValidationError(`${field} is invalid: ${value}`);
}

export function validateKnowledgeSource(input: {
  name: string;
  source_type: string;
  metadata?: Record<string, unknown>;
}): void {
  if (input.name.trim().length === 0) throw new ValidationError("knowledge_source.name is required");
  if (input.name.length > 160) throw new ValidationError("knowledge_source.name is too long");
  assertIn(KNOWLEDGE_SOURCE_TYPES, input.source_type, "knowledge_source.source_type");
  validateObject(input.metadata ?? {}, "knowledge_source.metadata");
}

export function validateKnowledgeEntry(input: {
  title: string;
  body: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): void {
  if (input.title.trim().length === 0) throw new ValidationError("knowledge_entry.title is required");
  if (input.title.length > 240) throw new ValidationError("knowledge_entry.title is too long");
  if (input.body.trim().length === 0) throw new ValidationError("knowledge_entry.body is required");
  if (input.body.length > 20000) throw new ValidationError("knowledge_entry.body is too long");
  for (const tag of input.tags ?? []) {
    if (tag.trim().length === 0) throw new ValidationError("knowledge_entry.tags cannot contain blank values");
  }
  validateObject(input.metadata ?? {}, "knowledge_entry.metadata");
}

export function validateKnowledgeSourceStatus(status: string): asserts status is KnowledgeSourceStatus {
  assertIn(KNOWLEDGE_SOURCE_STATUSES, status, "knowledge_source.status");
}

export function assertKnowledgeSourceActive(status: string): void {
  validateKnowledgeSourceStatus(status);
  if (status !== "active") throw new ConflictError("knowledge source is not active");
}

export function normalizeKnowledgeQuery(query: string): string {
  const normalized = query.trim();
  if (normalized.length === 0) throw new ValidationError("knowledge search query is required");
  if (normalized.length > 200) throw new ValidationError("knowledge search query is too long");
  return normalized;
}

export function normalizeKnowledgeLimit(limit: number | undefined): number {
  if (limit === undefined) return 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new ValidationError("knowledge search limit must be between 1 and 50");
  return limit;
}

export function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function validateObject(value: Record<string, unknown>, field: string): void {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new ValidationError(`${field} must be an object`);
}

export type { KnowledgeSourceType };
