import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import {
  MockRuntimeAdapterFactory,
} from "../../src/application/runtime/adapter-factory.js";
import {
  FakeLocalMcpHarness,
  MCPSafetyRuntime,
} from "../../src/application/runtime/mcp-safety-runtime.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import * as jobRepo from "../../src/infrastructure/repositories/execution-job.repository.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";
import * as outboxRepo from "../../src/infrastructure/repositories/outbox.repository.js";
import * as invocationRepo from "../../src/infrastructure/repositories/tool-invocation.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(() => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

describe("Sprint-7 MCP runtime safety worker", () => {
  it("processes explicit fake/local MCP safety jobs through execution ledger without writing MCP control-plane invocations", async () => {
    const factory = new MockRuntimeAdapterFactory({
      adapterMode: "real",
      mcpSafetyRuntime: new MCPSafetyRuntime(new FakeLocalMcpHarness()),
    });
    const worker = new ExecutionWorker(
      db,
      factory,
      5000,
      30000,
      30000,
      {
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: false,
        allowProcessSpawn: true,
        requireCredentialRef: false,
        redactSnapshots: true,
      },
    );
    const key = `sprint7-mcp-safety-${randomUUID()}`;
    const beforeInvocations = await invocationRepo.listInvocations(db, "00000000-0000-0000-0000-000000000010");
    const job = await jobRepo.createJob(db, {
      type: "mcp",
      payload: {
        serverRef: "mcp://local/test",
        toolName: "safe_read",
        input: { path: "/tmp/readme.md" },
        sandbox: { profile: "local-test", allowProcessSpawn: true },
        fakeStdout: "ok token=secret-value",
        fakeStderr: "Bearer sk-test-secret",
      },
      idempotency_key: key,
      max_attempts: 1,
    });

    await worker.tickJob(job.id);

    const updated = await jobRepo.getJob(db, job.id);
    const results = await resultRepo.listResultsByJob(db, job.id);
    const events = await outboxRepo.listOutboxEventsByAggregateId(db, job.id);
    const afterInvocations = await invocationRepo.listInvocations(db, "00000000-0000-0000-0000-000000000010");

    expect(updated).toMatchObject({ status: "success" });
    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result).toMatchObject({
      jobType: "mcp",
      runtimeStatus: "success",
      status: "success",
    });
    expect(result.responseSnapshot).toMatchObject({
      metadata: {
        adapterMode: "mcp_safety",
        processSpawned: true,
        mcpHarness: "fake_local",
        snapshots: { stdout: "[REDACTED]", stderr: "[REDACTED]" },
      },
    });
    expect(JSON.stringify(result.responseSnapshot)).not.toContain("sk-test-secret");
    expect(events.some((event) => event.eventType === EXECUTION_OUTBOX_EVENTS.success)).toBe(true);
    expect(afterInvocations).toHaveLength(beforeInvocations.length);
  });
});
