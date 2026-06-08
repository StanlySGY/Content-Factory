import { createHash } from "node:crypto";
import { ValidationError } from "../errors.js";

export const PUBLISHER_ACTIONS = ["preview", "publish", "rollback_plan"] as const;
export type PublisherAction = (typeof PUBLISHER_ACTIONS)[number];

export interface PublisherPreviewSnapshot {
  previewId: string;
  checksum: string;
}

export interface PublisherRequestIdInput {
  targetRef: string;
  channel: string;
  previewId: string;
  idempotencyKey: string;
}

export interface PublisherRollbackPlanSnapshot {
  executable: false;
  targetRef: string;
  channel: string;
  publisherRequestId: string;
  operations: ["unpublish_snapshot_only"];
  externalCallsAllowed: false;
}

export interface PublisherRuntimePayload {
  action: PublisherAction;
  targetRef: string;
  channel: string;
  content: Record<string, unknown>;
  approved: boolean;
  approvalRef: string | null;
  preview: PublisherPreviewSnapshot | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required`);
  return value;
}

export function buildPublisherRequestId(input: PublisherRequestIdInput): string {
  const hash = createHash("sha256")
    .update(`${input.targetRef}|${input.channel}|${input.previewId}|${input.idempotencyKey}`)
    .digest("hex")
    .slice(0, 24);
  return `publisher-${hash}`;
}

export function buildRollbackPlanSnapshot(input: {
  targetRef: string;
  channel: string;
  publisherRequestId: string;
}): PublisherRollbackPlanSnapshot {
  return {
    executable: false,
    targetRef: input.targetRef,
    channel: input.channel,
    publisherRequestId: input.publisherRequestId,
    operations: ["unpublish_snapshot_only"],
    externalCallsAllowed: false,
  };
}

export function validatePublisherRuntimePayload(payload: Record<string, unknown>): PublisherRuntimePayload {
  const action = payload.action === undefined ? "preview" : payload.action;
  if (typeof action !== "string" || !(PUBLISHER_ACTIONS as readonly string[]).includes(action))
    throw new ValidationError(`invalid publisher action: ${String(action)}`);

  const preview = payload.preview;
  const previewSnapshot = isPlainObject(preview)
    ? {
        previewId: requiredString(preview.previewId, "publisher preview.previewId"),
        checksum: requiredString(preview.checksum, "publisher preview.checksum"),
      }
    : null;

  return {
    action: action as PublisherAction,
    targetRef: requiredString(payload.targetRef, "publisher targetRef"),
    channel: requiredString(payload.channel, "publisher channel"),
    content: isPlainObject(payload.content) ? payload.content : {},
    approved: payload.approved === true,
    approvalRef: typeof payload.approvalRef === "string" && payload.approvalRef.trim().length > 0
      ? payload.approvalRef
      : null,
    preview: previewSnapshot,
  };
}
