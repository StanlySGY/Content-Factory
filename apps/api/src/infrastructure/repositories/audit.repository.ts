import { sql } from "drizzle-orm";
import type { AuditEventDTO } from "@cf/shared";
import type { Db } from "../db/client.js";

// audit_events：sequence_no / prev_hash / entry_hash 由 BEFORE INSERT 触发器哈希链填充（ADR-008）
// 用原生 SQL 插入（触发器驱动列不由应用提供）；RLS 谓词由调用方 runInProject 注入

export interface AuditAppend {
  projectId: string;
  actorId: string | null;
  subjectType: string;
  subjectId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  subject_type: string;
  subject_id: string;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  sequence_no: string | number;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string | Date;
}

const SELECT_COLS = sql`id, actor_id, subject_type, subject_id, action,
  before_data, after_data, metadata, sequence_no, prev_hash, entry_hash, created_at`;

// drizzle 的 db.execute() 绕过 pg 类型解析：timestamptz/bigint 回传字符串，jsonb 已为对象
function toDTO(r: AuditRow): AuditEventDTO {
  return {
    id: r.id,
    subject_type: r.subject_type,
    subject_id: r.subject_id,
    action: r.action,
    actor_id: r.actor_id,
    before_data: r.before_data,
    after_data: r.after_data,
    metadata: r.metadata,
    sequence_no: Number(r.sequence_no),
    prev_hash: r.prev_hash,
    entry_hash: r.entry_hash,
    created_at: new Date(r.created_at).toISOString(),
  };
}

export async function appendAudit(
  db: Db,
  e: AuditAppend,
): Promise<AuditEventDTO> {
  const before = e.before === null ? null : JSON.stringify(e.before);
  const after = e.after === null ? null : JSON.stringify(e.after);
  const meta = JSON.stringify(e.metadata);
  const res = await db.execute(sql`
    INSERT INTO audit_events
      (project_id, actor_id, subject_type, subject_id, action, before_data, after_data, metadata)
    VALUES
      (${e.projectId}, ${e.actorId}, ${e.subjectType}, ${e.subjectId}, ${e.action},
       ${before}::jsonb, ${after}::jsonb, ${meta}::jsonb)
    RETURNING ${SELECT_COLS}
  `);
  return toDTO((res.rows as unknown as AuditRow[])[0]!);
}

export async function listAuditBySubject(
  db: Db,
  subjectType: string,
  subjectId: string,
): Promise<AuditEventDTO[]> {
  const res = await db.execute(sql`
    SELECT ${SELECT_COLS}
    FROM audit_events
    WHERE subject_type = ${subjectType} AND subject_id = ${subjectId}
    ORDER BY sequence_no ASC
  `);
  return (res.rows as unknown as AuditRow[]).map(toDTO);
}
