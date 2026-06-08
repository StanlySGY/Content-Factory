import { describe, expect, it } from "vitest";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import { buildRuntimeExecutionContext, type RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";
import {
  FakeLocalPublisherHarness,
  PublisherSafetyRuntime,
} from "../../src/application/runtime/publisher-safety-runtime.js";
import {
  buildPublisherRequestId,
  buildRollbackPlanSnapshot,
} from "../../src/domain/execution/publisher-runtime.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: true,
  redactSnapshots: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  ...over,
});

const credentialRef = {
  provider: "wechat",
  keyRef: "secret://publisher/wechat",
  scope: "project" as const,
};

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "publisher-safety-unit",
  jobType: "publisher",
  payload: {
    action: "preview",
    targetRef: "publisher://wechat/draft",
    channel: "wechat",
    content: { title: "Hello", body: "World" },
    ...payload,
  },
  attemptCount: 1,
  idempotencyKey: "publisher-safety-unit",
  timeoutMs: 30000,
  metadata: {},
});

const context = (over: Partial<RuntimeSafetyPolicy> = {}) =>
  buildRuntimeExecutionContext({
    jobId: "publisher-safety-unit",
    jobType: "publisher",
    timeoutMs: 30000,
    policy: policy(over),
    credentialRef,
  });

describe("PublisherSafetyRuntime", () => {
  it("creates a preview without external publish or secret material", async () => {
    const res = await new PublisherSafetyRuntime(new FakeLocalPublisherHarness()).execute(request(), context());

    expect(res).toMatchObject({
      status: "success",
      output: {
        provider: "publisher",
        action: "preview",
        externalPublished: false,
        preview: {
          previewId: "preview-publisher-safety-unit-1",
        },
      },
      metadata: {
        adapterMode: "publisher_safety",
        publisherHarness: "fake_local",
        networkUsed: false,
        processSpawned: false,
        secret_material_read: false,
        secret_material_returned: false,
      },
    });
    expect(JSON.stringify(res)).not.toContain("secret://publisher/wechat");
  });

  it("blocks publish until preview and approval are present", async () => {
    await expect(new PublisherSafetyRuntime(new FakeLocalPublisherHarness()).execute(
      request({ action: "publish", approved: true }),
      context(),
    )).resolves.toMatchObject({
      status: "failed",
      errorType: "blocked",
      retryable: false,
      output: { blocked: true, reason: "preview_required" },
    });

    await expect(new PublisherSafetyRuntime(new FakeLocalPublisherHarness()).execute(
      request({ action: "publish", preview: { previewId: "preview-1", checksum: "sha256:abc" } }),
      context(),
    )).resolves.toMatchObject({
      status: "failed",
      errorType: "blocked",
      retryable: false,
      output: { blocked: true, reason: "approval_required" },
    });
  });

  it("returns an idempotent fake publish snapshot with rollback plan only", async () => {
    const payload = {
      action: "publish",
      approved: true,
      approvalRef: "approval://local/1",
      preview: { previewId: "preview-1", checksum: "sha256:abc" },
      content: { title: "Hello", body: "World", api_key: "should-hide" },
    };
    const runtime = new PublisherSafetyRuntime(new FakeLocalPublisherHarness());
    const first = await runtime.execute(request(payload), context());
    const second = await runtime.execute(request(payload), context());

    expect(first).toMatchObject({
      status: "success",
      output: {
        action: "publish",
        externalPublished: false,
        fakePublished: true,
        rollbackPlan: {
          executable: false,
          operations: ["unpublish_snapshot_only"],
        },
      },
      metadata: {
        approvalRequired: true,
        approvalPresent: true,
        credentialRefPresent: true,
        credentialProvider: "wechat",
        credentialScope: "project",
      },
    });
    expect(first.output.publisherRequestId).toBe(second.output.publisherRequestId);
    expect(first.output.publisherRequestId).toBe(buildPublisherRequestId({
      targetRef: "publisher://wechat/draft",
      channel: "wechat",
      previewId: "preview-1",
      idempotencyKey: "publisher-safety-unit",
    }));
    expect(JSON.stringify(first)).not.toContain("should-hide");
    expect(JSON.stringify(first)).not.toContain("secret://publisher/wechat");
  });

  it("builds rollback and unpublish plan snapshots without executing them", () => {
    expect(buildRollbackPlanSnapshot({
      targetRef: "publisher://wechat/draft",
      channel: "wechat",
      publisherRequestId: "pub-1",
    })).toEqual({
      executable: false,
      targetRef: "publisher://wechat/draft",
      channel: "wechat",
      publisherRequestId: "pub-1",
      operations: ["unpublish_snapshot_only"],
      externalCallsAllowed: false,
    });
  });

  it("fails closed without credential ref or explicit fake harness", async () => {
    const noCredentialContext = buildRuntimeExecutionContext({
      jobId: "publisher-safety-unit",
      jobType: "publisher",
      timeoutMs: 30000,
      policy: policy(),
    });

    await expect(new PublisherSafetyRuntime(new FakeLocalPublisherHarness()).execute(
      request(),
      noCredentialContext,
    )).resolves.toMatchObject({
      status: "failed",
      errorType: "permission_denied",
    });

    await expect(new PublisherSafetyRuntime(null).execute(
      request(),
      context(),
    )).resolves.toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      error: "publisher local harness is not registered",
    });
  });
});
