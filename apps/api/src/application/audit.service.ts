import type { AuditEventDTO } from "@cf/shared";
import type { Db } from "../infrastructure/db/client.js";
import {
  appendAudit,
  listAuditBySubject,
  type AuditAppend,
} from "../infrastructure/repositories/audit.repository.js";
import { redactObject } from "./redaction.service.js";

export interface AuditWrite {
  projectId: string;
  actorId: string | null;
  subjectType: string;
  subjectId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * 审计写入：统一脱敏（ADR-012）后追加；哈希链/序列号由 DB 触发器保证（ADR-008）。
 * 必须与业务变更同事务（db §10.1）——故接收事务句柄 tx。
 */
export async function recordAudit(
  tx: Db,
  w: AuditWrite,
): Promise<AuditEventDTO> {
  const append: AuditAppend = {
    projectId: w.projectId,
    actorId: w.actorId,
    subjectType: w.subjectType,
    subjectId: w.subjectId,
    action: w.action,
    before: redactObject(w.before ?? null),
    after: redactObject(w.after ?? null),
    metadata: (redactObject(w.metadata ?? {}) ?? {}) as Record<string, unknown>,
  };
  return appendAudit(tx, append);
}

/** 读取主体审计链（按 sequence_no 升序）；调用方须以审计读取身份 + 项目上下文执行 */
export async function getAuditTrail(
  tx: Db,
  subjectType: string,
  subjectId: string,
): Promise<AuditEventDTO[]> {
  return listAuditBySubject(tx, subjectType, subjectId);
}
