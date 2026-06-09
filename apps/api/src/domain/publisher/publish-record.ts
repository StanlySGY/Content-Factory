import { PUBLISH_RECORD_STATUSES, type PublishRecordStatus } from "@cf/shared";
import { InvalidTransitionError, ValidationError } from "../errors.js";

export interface CreatePublishRecordInput {
  content_task_id: string;
  content_asset_id: string;
  asset_version_id: string;
  channel: string;
  idempotency_key: string;
  metadata?: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new ValidationError(`${label} is required`);
  return value;
}

function requiredString(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required`);
  if (value.length > max) throw new ValidationError(`${label} is too long`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateCreatePublishRecord(input: CreatePublishRecordInput): void {
  requiredUuid(input.content_task_id, "content_task_id");
  requiredUuid(input.content_asset_id, "content_asset_id");
  requiredUuid(input.asset_version_id, "asset_version_id");
  requiredString(input.channel, "channel", 64);
  requiredString(input.idempotency_key, "idempotency_key", 200);
  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    throw new ValidationError("metadata must be an object");
  }
}

export function validatePublishRecordStatus(status: string): asserts status is PublishRecordStatus {
  if (!(PUBLISH_RECORD_STATUSES as readonly string[]).includes(status))
    throw new ValidationError(`invalid publish_record status: ${status}`);
}

export function transitionPublishRecordStatus(
  from: PublishRecordStatus,
  to: PublishRecordStatus,
): PublishRecordStatus {
  validatePublishRecordStatus(from);
  validatePublishRecordStatus(to);
  const allowed: Record<PublishRecordStatus, PublishRecordStatus[]> = {
    pending: ["publishing", "failed"],
    publishing: ["published", "failed"],
    published: ["withdrawn"],
    failed: [],
    withdrawn: [],
  };
  if (!allowed[from].includes(to)) {
    throw new InvalidTransitionError(`invalid publish_record status transition: ${from} -> ${to}`);
  }
  return to;
}

export function publishRecordSnapshot(input: {
  id: string;
  status: string;
  channel: string;
  assetVersionId: string;
  executionJobId: string | null;
  externalRef: string | null;
}): Record<string, unknown> {
  return {
    id: input.id,
    status: input.status,
    channel: input.channel,
    asset_version_id: input.assetVersionId,
    execution_job_id: input.executionJobId,
    external_ref: input.externalRef,
  };
}
