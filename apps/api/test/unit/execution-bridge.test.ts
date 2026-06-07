import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionIdempotencyKey,
  buildExecutionPayload,
  unwrapExecutionPayload,
  validateExecutionBridgeRequest,
  validateExecutionSubjectRef,
  type CreateExecutionRequest,
} from "../../src/domain/execution/bridge.js";

const reqOf = (over: Partial<CreateExecutionRequest> = {}): CreateExecutionRequest => ({
  subjectRef: { subjectType: "workflow_stage_run", subjectId: "sr-1", metadata: {} },
  jobType: "agent",
  payload: { foo: "bar" },
  ...over,
});

describe("Execution bridge domain", () => {
  it("rejects an invalid subject ref", () => {
    expect(() => validateExecutionSubjectRef({ subjectType: "nope" as never, subjectId: "x" })).toThrow(ValidationError);
    expect(() => validateExecutionSubjectRef({ subjectType: "mcp_tool", subjectId: " " })).toThrow(ValidationError);
    expect(() => validateExecutionSubjectRef({ subjectType: "mcp_tool", subjectId: "t1" })).not.toThrow();
  });

  it("rejects subject/job type mismatch and accepts each valid mapping", () => {
    expect(() => validateExecutionBridgeRequest(reqOf())).not.toThrow(); // workflow_stage_run -> agent
    expect(() => validateExecutionBridgeRequest(reqOf({ subjectRef: { subjectType: "agent_profile", subjectId: "a1" }, jobType: "agent" }))).not.toThrow();
    expect(() => validateExecutionBridgeRequest(reqOf({ subjectRef: { subjectType: "mcp_tool", subjectId: "t1" }, jobType: "mcp" }))).not.toThrow();
    expect(() => validateExecutionBridgeRequest(reqOf({ subjectRef: { subjectType: "publisher_target", subjectId: "p1" }, jobType: "publisher" }))).not.toThrow();
    expect(() => validateExecutionBridgeRequest(reqOf({ subjectRef: { subjectType: "workflow_stage_run", subjectId: "s" }, jobType: "mcp" }))).toThrow(ValidationError);
    expect(() => validateExecutionBridgeRequest(reqOf({ subjectRef: { subjectType: "mcp_tool", subjectId: "t1" }, jobType: "agent" }))).toThrow(ValidationError);
  });

  it("builds a deterministic idempotency key independent of payload key order", () => {
    const a = buildExecutionIdempotencyKey(reqOf({ payload: { a: 1, b: 2 } }));
    const b = buildExecutionIdempotencyKey(reqOf({ payload: { b: 2, a: 1 } }));
    expect(a).toBe(b);
    expect(a.startsWith("bridge-")).toBe(true);
    expect(buildExecutionIdempotencyKey(reqOf({ subjectRef: { subjectType: "workflow_stage_run", subjectId: "sr-2" } }))).not.toBe(a);
  });

  it("builds a normalized envelope and unwraps it back to input + subject", () => {
    const env = buildExecutionPayload(
      reqOf({
        subjectRef: { subjectType: "workflow_stage_run", subjectId: "sr-1", projectId: "p", metadata: { k: 1 } },
        payload: { mockStatus: "failed" },
      }),
    );
    expect(env).toEqual({
      schema_version: 1,
      subject: { type: "workflow_stage_run", id: "sr-1", project_id: "p", metadata: { k: 1 } },
      input: { mockStatus: "failed" },
    });
    const { input, subject } = unwrapExecutionPayload(env as unknown as Record<string, unknown>);
    expect(input).toEqual({ mockStatus: "failed" });
    expect(subject).toMatchObject({ type: "workflow_stage_run", id: "sr-1", project_id: "p" });
  });

  it("unwraps a flat (non-bridge) payload to a null subject", () => {
    const { input, subject } = unwrapExecutionPayload({ mockStatus: "success" });
    expect(input).toEqual({ mockStatus: "success" });
    expect(subject).toBeNull();
  });
});
