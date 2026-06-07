import { describe, expect, it } from "vitest";
import type { ExecutionJobRow } from "../../src/infrastructure/db/schema.js";
import {
  AgentMockRuntime,
  MCPMockRuntime,
  PublisherMockRuntime,
} from "../../src/application/runtime/mock-runtimes.js";

const job = (payload: Record<string, unknown>, type: ExecutionJobRow["type"] = "agent"): ExecutionJobRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  type,
  status: "running",
  payload,
  idempotencyKey: "idem-1",
  attemptCount: 1,
  maxAttempts: 3,
  lastError: null,
  nextRunAt: null,
  finishedAt: null,
  lockedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("Execution mock runtimes", () => {
  it("returns deterministic success, failed, and blocked results without external calls", async () => {
    await expect(new AgentMockRuntime().execute(job({}))).resolves.toMatchObject({
      status: "success",
      output: { kind: "agent", result: "mock" },
    });
    await expect(new MCPMockRuntime().execute(job({ mockStatus: "failed" }, "mcp"))).resolves.toMatchObject({
      status: "failed",
      error: "mock failure",
      output: { kind: "mcp" },
    });
    await expect(
      new PublisherMockRuntime().execute(job({ mockStatus: "blocked" }, "publisher")),
    ).resolves.toMatchObject({
      status: "failed",
      error: "mock blocked",
      output: { kind: "publisher", blocked: true },
    });
  });
});
