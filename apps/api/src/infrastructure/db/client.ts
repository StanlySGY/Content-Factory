import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/**
 * 在项目 RLS 上下文内执行（事务级 set_config，连接归还自动复位）。
 * audit_events 的 RLS 谓词读取 app.current_project_id；content_tasks 由仓储显式谓词强制（ADR-009）。
 */
export async function runInProject<T>(
  db: Db,
  projectId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_project_id', ${projectId}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}
