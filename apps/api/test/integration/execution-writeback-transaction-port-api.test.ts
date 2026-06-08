import { count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionWritebacks, stageRuns } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let db: Db;
let pool: ReturnType<typeof createPool>;

beforeAll(async () => {
  const env = loadEnv();
  built = await buildApp(env, { logger: false });
  app = built.app;
  db = createDb((pool = createPool(env.databaseUrl)));
  await app.ready();
});

afterAll(async () => {
  await pool.end();
  await built.close();
});

describe("Execution writeback transaction port readiness API", () => {
  it("exposes disabled transaction port readiness without writing control-plane or writeback rows", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-transaction-port-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_transaction_port",
      executable: false,
      transaction_port_registered: false,
      control_plane_read_allowed: false,
      control_plane_write_allowed: false,
      audit_write_allowed: false,
      capabilities: {
        kind: "disabled_control_plane_transaction_port",
        registered: false,
        can_read_subject: false,
        can_validate_state_transition: false,
        can_update_subject: false,
        can_append_audit: false,
        can_mark_applied: false,
      },
    });
    expect(res.json().methods.map((m: { method: string }) => m.method)).toEqual([
      "load_subject",
      "validate_state_transition",
      "update_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ]);
    expect(res.json().methods.every((m: { status: string; executed: boolean }) => m.status === "blocked" && !m.executed)).toBe(
      true,
    );
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
