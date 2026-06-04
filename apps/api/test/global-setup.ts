import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

// 集成测试前：将测试库重置为 pristine。
// 采用 DROP/CREATE SCHEMA 而非 migrate down——回滚需逆序，但 seed(0005) 早于 audit 表(0003) 回滚，
// 测试写入的 audit_events 仍引用 seed 项目 → FK 冲突。整模式重建可规避跨迁移回滚顺序问题。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(ROOT, ".env") });

const MIGRATE = [
  "exec",
  "dotenv",
  "-e",
  ".env",
  "--",
  "node-pg-migrate",
  "-m",
  "db/migrations",
  "-j",
  "js",
  "-d",
  "DATABASE_ADMIN_URL_TEST",
];

async function resetSchema(): Promise<void> {
  // 测试库专属管理连接（sgy/owner，socket peer）：重建 public，授权由 0004 迁移恢复
  const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL_TEST });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<void> {
  try {
    await resetSchema();
    execFileSync("pnpm", [...MIGRATE, "up"], { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    // 测试库未供给（db/provision.sql 未执行）→ 降级告警，单元测试仍可运行；集成测试将在连接时失败
    console.warn(
      `[global-setup] 测试库未就绪，集成测试将失败直至执行 db/provision.sql：${(e as Error).message}`,
    );
  }
}
