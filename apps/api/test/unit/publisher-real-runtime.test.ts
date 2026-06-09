import { describe, expect, it } from "vitest";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import { buildRuntimeExecutionContext, type RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";
import {
  PublisherRealRuntime,
  PublisherReleaseHttpClient,
  buildPublisherRealRuntimeReadiness,
  parsePublisherEndpointRegistry,
} from "../../src/application/runtime/publisher-real-runtime.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  allowNetwork: true,
  allowProcessSpawn: false,
  requireCredentialRef: false,
  redactSnapshots: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  ...over,
});

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "publisher-real-unit",
  jobType: "publisher",
  payload: {
    action: "publish",
    targetRef: "publisher://wechat",
    channel: "wechat_mp",
    content: { title: "hello", api_key: "sk-input" },
    preview: { previewId: "preview-1", checksum: "sha256:abc" },
    approved: true,
    approvalRef: "approval-1",
    publishRecordId: "00000000-0000-0000-0000-000000000010",
    ...payload,
  },
  attemptCount: 1,
  idempotencyKey: "publisher-real-unit",
  timeoutMs: 30000,
  metadata: {},
});

const context = (over: Partial<RuntimeSafetyPolicy> = {}) =>
  buildRuntimeExecutionContext({
    jobId: "publisher-real-unit",
    jobType: "publisher",
    timeoutMs: 30000,
    policy: policy(over),
  });

describe("Publisher real runtime", () => {
  it("builds readiness from real runtime gates, endpoint registry and channel allowlist", () => {
    expect(buildPublisherRealRuntimeReadiness({
      enabled: false,
      endpointRegistry: [],
      channelAllowlist: [],
      runtimeSafetyPolicy: policy({ allowNetwork: false, allowRealExecution: false }),
      networkAllowlist: [],
    })).toMatchObject({
      mode: "publisher_real_runtime_readiness",
      ready: false,
      status: "blocked",
      enabled: false,
    });

    expect(buildPublisherRealRuntimeReadiness({
      enabled: true,
      endpointRegistry: ["publisher://wechat=https://publisher.example.test/release"],
      channelAllowlist: ["wechat_mp"],
      runtimeSafetyPolicy: policy(),
      networkAllowlist: ["publisher.example.test"],
    })).toMatchObject({
      ready: true,
      status: "ready",
      endpoint_registry_count: 1,
      channel_allowlist_count: 1,
    });
  });

  it("calls external publisher release endpoint and redacts snapshots", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const runtime = new PublisherRealRuntime(new PublisherReleaseHttpClient(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ externalRef: "wx-draft-1", secret: "Bearer sk-secret" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }), {
      endpointRegistry: parsePublisherEndpointRegistry(["publisher://wechat=https://publisher.example.test/release"]),
      channelAllowlist: ["wechat_mp"],
      networkAllowlist: ["publisher.example.test"],
    });

    const res = await runtime.execute(request(), context());

    expect(res).toMatchObject({
      status: "success",
      output: {
        provider: "publisher",
        action: "publish",
        externalPublished: true,
        externalRef: "wx-draft-1",
      },
      metadata: {
        adapterMode: "publisher_real",
        networkUsed: true,
        processSpawned: false,
        targetRef: "publisher://wechat",
        channel: "wechat_mp",
        endpointHost: "publisher.example.test",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      action: "publish",
      channel: "wechat_mp",
      preview: { previewId: "preview-1", checksum: "sha256:abc" },
      approvalRef: "approval-1",
    });
    expect(JSON.stringify(res)).not.toContain("sk-secret");
    expect(JSON.stringify(res)).not.toContain("sk-input");
  });

  it("blocks unsafe publisher requests before network", async () => {
    let called = false;
    const runtime = new PublisherRealRuntime(new PublisherReleaseHttpClient(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }), {
      endpointRegistry: parsePublisherEndpointRegistry(["publisher://wechat=https://publisher.example.test/release"]),
      channelAllowlist: ["wechat_mp"],
      networkAllowlist: ["publisher.example.test"],
    });

    await expect(runtime.execute(request({ channel: "not_allowed" }), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      metadata: { networkUsed: false },
    });
    await expect(runtime.execute(request({ approved: false }), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "blocked",
      metadata: { networkUsed: false },
    });
    await expect(runtime.execute(request({ publishRecordId: "" }), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "blocked",
      metadata: { networkUsed: false },
    });
    const hostBlocked = new PublisherRealRuntime(new PublisherReleaseHttpClient(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }), {
      endpointRegistry: parsePublisherEndpointRegistry(["publisher://wechat=https://publisher.example.test/release"]),
      channelAllowlist: ["wechat_mp"],
      networkAllowlist: ["other.example.test"],
    });
    await expect(hostBlocked.execute(request(), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      metadata: { networkUsed: false },
    });
    expect(called).toBe(false);
  });
});
