import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import {
  FakeLocalPublisherHarness,
  PublisherSafetyRuntime,
} from "../../src/application/runtime/publisher-safety-runtime.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(() => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const credentialRef = {
  provider: "wechat",
  keyRef: "secret://publisher/wechat",
  scope: "project" as const,
};

function publisherWorker() {
  return new ExecutionWorker(
    db,
    new MockRuntimeAdapterFactory({
      adapterMode: "real",
      publisherSafetyRuntime: new PublisherSafetyRuntime(new FakeLocalPublisherHarness()),
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: false,
      requireCredentialRef: true,
    }),
    5000,
    30000,
    30000,
    {
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: false,
      requireCredentialRef: true,
      redactSnapshots: true,
    },
  );
}

describe("Sprint-8 Publisher runtime safety worker", () => {
  it("processes fake/local publisher publish jobs through execution ledger without writing Sprint-4 tables", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const [job] = await db.insert(executionJobs).values({
      type: "publisher",
      status: "pending",
      payload: {
        action: "publish",
        targetRef: "publisher://wechat/draft",
        channel: "wechat",
        approved: true,
        approvalRef: "approval://local/1",
        preview: { previewId: "preview-1", checksum: "sha256:abc" },
        content: { title: "Hello", body: "World", token: "publish-secret" },
        credential_ref: credentialRef,
      },
      idempotencyKey: `sprint8-publisher-${randomUUID()}`,
      maxAttempts: 1,
    }).returning();

    const updated = await publisherWorker().tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job!.id));
    const success = events.find((event) => event.eventType === "execution_job.success");

    expect(updated.status).toBe("success");
    expect(result).toMatchObject({
      jobType: "publisher",
      runtimeStatus: "success",
      status: "success",
      responseSnapshot: {
        output: {
          action: "publish",
          externalPublished: false,
          rollbackPlan: {
            executable: false,
            operations: ["unpublish_snapshot_only"],
          },
        },
        metadata: {
          adapterMode: "publisher_safety",
          publisherHarness: "fake_local",
          networkUsed: false,
          secret_material_read: false,
          secret_material_returned: false,
        },
      },
    });
    expect(success?.payload).toMatchObject({
      result_id: result!.id,
      runtime: { status: "success" },
    });
    const persisted = JSON.stringify({ result, events });
    expect(persisted).not.toContain("publish-secret");
    expect(persisted).not.toContain("secret://publisher/wechat");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });

  it("keeps publisher real adapter fail-closed unless a safety runtime is explicitly injected", async () => {
    const [job] = await db.insert(executionJobs).values({
      type: "publisher",
      status: "pending",
      payload: {
        action: "preview",
        targetRef: "publisher://wechat/draft",
        channel: "wechat",
        content: { title: "Hello" },
        credential_ref: credentialRef,
      },
      idempotencyKey: `sprint8-publisher-default-${randomUUID()}`,
      maxAttempts: 1,
    }).returning();
    const worker = new ExecutionWorker(
      db,
      new MockRuntimeAdapterFactory({
        adapterMode: "real",
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: false,
      }),
      5000,
      30000,
      30000,
      { mode: "real_enabled", allowRealExecution: true, allowNetwork: false },
    );

    const updated = await worker.tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);

    expect(updated.status).toBe("failed");
    expect(result!.errorType).toBe("validation_error");
    expect(JSON.stringify(result!.responseSnapshot)).toContain("publisher safety runtime requires explicit local harness registration");
  });
});
