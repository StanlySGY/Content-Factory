import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// 加载仓库根 .env，并将运行时连接指向测试库（每个 worker 执行）
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(ROOT, ".env") });

if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
if (process.env.DATABASE_AUDIT_URL_TEST)
  process.env.DATABASE_AUDIT_URL = process.env.DATABASE_AUDIT_URL_TEST;
if (process.env.DATABASE_ADMIN_URL_TEST)
  process.env.DATABASE_ADMIN_URL = process.env.DATABASE_ADMIN_URL_TEST;
