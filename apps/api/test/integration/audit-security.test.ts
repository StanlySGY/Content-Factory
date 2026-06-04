import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID } from "../../src/config/env.js";

// 直连 DB 验证审计安全强制点（ADR-008 append-only/哈希链、ADR-009 RLS）——DB 层不可 mock
let appClient: pg.Client; // cf_app（非属主，RLS 生效）
let adminClient: pg.Client; // sgy（库属主，FORCE RLS 亦生效）

beforeAll(async () => {
  appClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await appClient.connect();
  adminClient = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await adminClient.connect();
});
afterAll(async () => {
  await appClient.end();
  await adminClient.end();
});

interface AuditInsertRow {
  id: string;
  sequence_no: string;
  prev_hash: string | null;
  entry_hash: string;
}

async function insertAudit(
  client: pg.Client,
  projectId: string,
  action: string,
): Promise<AuditInsertRow> {
  await client.query("BEGIN");
  try {
    await client.query("select set_config('app.current_project_id', $1, true)", [projectId]);
    const r = await client.query<AuditInsertRow>(
      `INSERT INTO audit_events (project_id, actor_id, subject_type, subject_id, action, metadata)
       VALUES ($1, NULL, 'content_task', gen_random_uuid(), $2, '{}'::jsonb)
       RETURNING id, sequence_no, prev_hash, entry_hash`,
      [projectId, action],
    );
    await client.query("COMMIT");
    return r.rows[0]!;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

describe("audit append-only (ADR-008)", () => {
  it("blocks UPDATE even for the table owner (trigger)", async () => {
    const e = await insertAudit(adminClient, DEFAULT_PROJECT_ID, "test.update_block");
    await adminClient.query("BEGIN");
    await adminClient.query("select set_config('app.current_project_id',$1,true)", [
      DEFAULT_PROJECT_ID,
    ]);
    await expect(
      adminClient.query("UPDATE audit_events SET action='tampered' WHERE id=$1", [e.id]),
    ).rejects.toThrow(/append-only/);
    await adminClient.query("ROLLBACK");
  });

  it("blocks DELETE even for the table owner (trigger)", async () => {
    const e = await insertAudit(adminClient, DEFAULT_PROJECT_ID, "test.delete_block");
    await adminClient.query("BEGIN");
    await adminClient.query("select set_config('app.current_project_id',$1,true)", [
      DEFAULT_PROJECT_ID,
    ]);
    await expect(
      adminClient.query("DELETE FROM audit_events WHERE id=$1", [e.id]),
    ).rejects.toThrow(/append-only/);
    await adminClient.query("ROLLBACK");
  });

  it("builds a valid hash chain (64-hex entry_hash, prev links, monotonic seq)", async () => {
    const a = await insertAudit(adminClient, DEFAULT_PROJECT_ID, "chain.a");
    const b = await insertAudit(adminClient, DEFAULT_PROJECT_ID, "chain.b");
    expect(a.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.prev_hash).toBe(a.entry_hash);
    expect(Number(b.sequence_no)).toBe(Number(a.sequence_no) + 1);
  });
});

describe("RLS cross-project isolation (ADR-009)", () => {
  it("cf_app cannot read another project's audit events", async () => {
    const p2 = (
      await adminClient.query<{ id: string }>(
        `INSERT INTO projects (owner_id, name, status) VALUES ($1,'RLS P2','active') RETURNING id`,
        [DEFAULT_USER_ID],
      )
    ).rows[0]!.id;
    await insertAudit(adminClient, p2, "rls.secret");

    // scoped to default project → must NOT see p2 rows (USING 谓词过滤)
    await appClient.query("BEGIN");
    await appClient.query("select set_config('app.current_project_id',$1,true)", [
      DEFAULT_PROJECT_ID,
    ]);
    const hidden = await appClient.query<{ c: number }>(
      "SELECT count(*)::int c FROM audit_events WHERE project_id=$1",
      [p2],
    );
    await appClient.query("COMMIT");
    expect(hidden.rows[0]!.c).toBe(0);

    // scoped to p2 → sees its own rows
    await appClient.query("BEGIN");
    await appClient.query("select set_config('app.current_project_id',$1,true)", [p2]);
    const own = await appClient.query<{ c: number }>(
      "SELECT count(*)::int c FROM audit_events WHERE project_id=$1",
      [p2],
    );
    await appClient.query("COMMIT");
    expect(own.rows[0]!.c).toBeGreaterThanOrEqual(1);
  });

  it("denies all rows when project context is unset (secure default)", async () => {
    await insertAudit(adminClient, DEFAULT_PROJECT_ID, "rls.default_deny");
    // 不设置 app.current_project_id → USING nullif(...) 为 NULL → 0 行
    const r = await appClient.query<{ c: number }>("SELECT count(*)::int c FROM audit_events");
    expect(r.rows[0]!.c).toBe(0);
  });

  it("cf_app lacks UPDATE/DELETE privilege on audit_events", async () => {
    const e = await insertAudit(appClient, DEFAULT_PROJECT_ID, "priv.check");
    await appClient.query("BEGIN");
    await appClient.query("select set_config('app.current_project_id',$1,true)", [
      DEFAULT_PROJECT_ID,
    ]);
    await expect(
      appClient.query("UPDATE audit_events SET action='x' WHERE id=$1", [e.id]),
    ).rejects.toThrow();
    await appClient.query("ROLLBACK");
  });
});
