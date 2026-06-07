import { createHash } from "node:crypto";
import {
  EXECUTION_JOB_TYPES,
  EXECUTION_SUBJECT_TYPES,
  type ExecutionJobType,
  type ExecutionSubjectType,
} from "@cf/shared";
import { ValidationError } from "../errors.js";

// Control Plane Bridge（Phase 1.8）：控制平面 → execution plane 的稳定入口契约。
// 只定义桥接请求/载荷归一化与校验，不读业务表、不 join、不入 FK；projectId 仅作 payload metadata。

export const EXECUTION_PAYLOAD_SCHEMA_VERSION = 1;

export interface ExecutionSubjectRef {
  subjectType: ExecutionSubjectType;
  subjectId: string;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateExecutionRequest {
  subjectRef: ExecutionSubjectRef;
  jobType: ExecutionJobType;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  requestedBy?: string;
}

export interface ExecutionSubject {
  type: ExecutionSubjectType;
  id: string;
  project_id: string | null;
  metadata: Record<string, unknown>;
}

/** execution job payload 归一化 envelope（schema_version + subject + 原始 input）*/
export interface ExecutionJobEnvelope {
  schema_version: number;
  subject: ExecutionSubject;
  input: Record<string, unknown>;
}

// subjectType → 唯一允许的 jobType（桥接不允许跨类型）
const SUBJECT_JOB_TYPE: Record<ExecutionSubjectType, ExecutionJobType> = {
  workflow_stage_run: "agent",
  agent_profile: "agent",
  mcp_tool: "mcp",
  publisher_target: "publisher",
};

export function expectedJobType(subjectType: ExecutionSubjectType): ExecutionJobType {
  return SUBJECT_JOB_TYPE[subjectType];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function validateExecutionSubjectRef(ref: ExecutionSubjectRef): void {
  if (!(EXECUTION_SUBJECT_TYPES as readonly string[]).includes(ref.subjectType))
    throw new ValidationError(`invalid execution subject type: ${ref.subjectType}`);
  if (!ref.subjectId || ref.subjectId.trim().length === 0)
    throw new ValidationError("execution subject id is required");
  if (ref.projectId !== undefined && ref.projectId !== null && typeof ref.projectId !== "string")
    throw new ValidationError("execution subject projectId must be a string");
  if (ref.metadata !== undefined && !isPlainObject(ref.metadata))
    throw new ValidationError("execution subject metadata must be an object");
}

export function validateExecutionBridgeRequest(req: CreateExecutionRequest): void {
  validateExecutionSubjectRef(req.subjectRef);
  if (!(EXECUTION_JOB_TYPES as readonly string[]).includes(req.jobType))
    throw new ValidationError(`invalid execution job type: ${req.jobType}`);
  if (!isPlainObject(req.payload))
    throw new ValidationError("execution bridge payload must be a non-null object");
  const expected = expectedJobType(req.subjectRef.subjectType);
  if (req.jobType !== expected)
    throw new ValidationError(
      `subject type '${req.subjectRef.subjectType}' requires jobType '${expected}', got '${req.jobType}'`,
    );
  if (req.idempotencyKey !== undefined && req.idempotencyKey.trim().length === 0)
    throw new ValidationError("execution bridge idempotencyKey must be non-empty when provided");
}

// 稳定序列化（递归排序键）→ 幂等键与 payload 键序无关
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** 默认幂等键：sha256(subjectType + subjectId + jobType + payload)，确定性、与键序无关 */
export function buildExecutionIdempotencyKey(req: CreateExecutionRequest): string {
  const canonical = stableStringify({
    subjectType: req.subjectRef.subjectType,
    subjectId: req.subjectRef.subjectId,
    jobType: req.jobType,
    payload: req.payload,
  });
  return `bridge-${createHash("sha256").update(canonical).digest("hex")}`;
}

/** 归一化 execution job payload：{ schema_version, subject, input } */
export function buildExecutionPayload(req: CreateExecutionRequest): ExecutionJobEnvelope {
  return {
    schema_version: EXECUTION_PAYLOAD_SCHEMA_VERSION,
    subject: {
      type: req.subjectRef.subjectType,
      id: req.subjectRef.subjectId,
      project_id: req.subjectRef.projectId ?? null,
      metadata: req.subjectRef.metadata ?? {},
    },
    input: req.payload,
  };
}

/** 解包 job payload：识别 bridge envelope → { input, subject }；否则视为 flat（legacy）→ subject=null。
 *  worker/service 据此把 input 交给 Runtime、把 subject 透传到 RuntimeRequest.metadata 与 outbox。*/
export function unwrapExecutionPayload(payload: Record<string, unknown>): {
  input: Record<string, unknown>;
  subject: ExecutionSubject | null;
} {
  if (
    isPlainObject(payload) &&
    payload.schema_version === EXECUTION_PAYLOAD_SCHEMA_VERSION &&
    isPlainObject(payload.subject) &&
    "input" in payload
  ) {
    const input = isPlainObject(payload.input) ? payload.input : {};
    return { input, subject: payload.subject as unknown as ExecutionSubject };
  }
  return { input: payload, subject: null };
}
