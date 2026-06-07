import { describe, expect, it } from "vitest";
import {
  AgentMockRuntime,
  MCPMockRuntime,
  PublisherMockRuntime,
} from "../../src/application/runtime/mock-runtimes.js";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";

const req = (payload: Record<string, unknown>, jobType: RuntimeRequest["jobType"] = "agent"): RuntimeRequest => ({
  jobId: "00000000-0000-0000-0000-000000000001",
  jobType,
  payload,
  attemptCount: 1,
  idempotencyKey: "idem-1",
  timeoutMs: 30000,
  metadata: {},
});

describe("Execution mock runtimes (RuntimeRequest -> RuntimeResponse)", () => {
  it("returns a deterministic success response without external calls", async () => {
    await expect(new AgentMockRuntime().execute(req({}))).resolves.toMatchObject({
      status: "success",
      output: { kind: "agent", result: "mock" },
      error: null,
      errorType: null,
      retryable: false,
    });
  });

  it("maps failed with default unknown error type (retryable)", async () => {
    await expect(new MCPMockRuntime().execute(req({ mockStatus: "failed" }, "mcp"))).resolves.toMatchObject({
      status: "failed",
      error: "mock failure",
      errorType: "unknown",
      retryable: true,
    });
  });

  it("treats blocked as a non-retryable failure that cannot be overridden", async () => {
    await expect(
      new PublisherMockRuntime().execute(req({ mockStatus: "blocked", mockRetryable: true }, "publisher")),
    ).resolves.toMatchObject({
      status: "failed",
      errorType: "blocked",
      retryable: false,
      output: { kind: "publisher", blocked: true },
    });
  });

  it("honors mockErrorType and mockRetryable override on a failed result", async () => {
    await expect(new AgentMockRuntime().execute(req({ mockStatus: "failed", mockErrorType: "rate_limited" }))).resolves.toMatchObject({
      status: "failed",
      errorType: "rate_limited",
      retryable: true,
    });
    await expect(new AgentMockRuntime().execute(req({ mockStatus: "failed", mockErrorType: "external_unavailable", mockRetryable: false }))).resolves.toMatchObject({
      status: "failed",
      errorType: "external_unavailable",
      retryable: false,
    });
  });

  it("returns a retryable timeout response when mockDelayMs exceeds timeoutMs", async () => {
    const response = await new AgentMockRuntime().execute(req({ mockDelayMs: 50000 }, "agent"));
    expect(response).toMatchObject({ status: "failed", errorType: "timeout", retryable: true });
    expect(response.error).toContain("timed out");
    expect(response.durationMs).toBe(30000);
  });

  it("factory returns the correct mock adapter by job type", () => {
    const factory = new MockRuntimeAdapterFactory();
    expect(factory.getRuntime("agent")).toBeInstanceOf(AgentMockRuntime);
    expect(factory.getRuntime("mcp")).toBeInstanceOf(MCPMockRuntime);
    expect(factory.getRuntime("publisher")).toBeInstanceOf(PublisherMockRuntime);
  });
});
