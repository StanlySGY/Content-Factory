import { describe, expect, it } from "vitest";
import {
  applyUpdate,
  createDraft,
} from "../../src/domain/content-task/content-task.js";
import {
  assertTransition,
  canTransition,
} from "../../src/domain/content-task/status.js";
import { InvalidTransitionError, ValidationError } from "../../src/domain/errors.js";

const req = { schema_version: 1 as const, summary: "s" };
const base = {
  title: "T",
  content_type: "article",
  priority: "normal" as const,
  requirement_data: req,
};

describe("createDraft", () => {
  it("defaults to draft and normalizes optionals", () => {
    const w = createDraft(base);
    expect(w.status).toBe("draft");
    expect(w.owner_id).toBeNull();
    expect(w.due_at).toBeNull();
    expect(w.archived_at).toBeNull();
  });

  it("keeps provided owner/due", () => {
    const w = createDraft({
      ...base,
      owner_id: "00000000-0000-0000-0000-000000000001",
      due_at: "2026-12-31T00:00:00.000Z",
    });
    expect(w.owner_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(w.due_at).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects blank title", () => {
    expect(() => createDraft({ ...base, title: "   " })).toThrow(ValidationError);
  });
  it("rejects over-length title", () => {
    expect(() => createDraft({ ...base, title: "a".repeat(241) })).toThrow(
      ValidationError,
    );
  });
  it("rejects blank content_type", () => {
    expect(() => createDraft({ ...base, content_type: "" })).toThrow(
      ValidationError,
    );
  });
  it("rejects wrong requirement schema_version", () => {
    expect(() =>
      createDraft({ ...base, requirement_data: { schema_version: 2 } as never }),
    ).toThrow(ValidationError);
  });
});

describe("task status machine (ADR-006)", () => {
  it("allows draft→ready / draft→cancelled", () => {
    expect(canTransition("draft", "ready")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
  });
  it("forbids workflow-driven draft→running in S1", () => {
    expect(canTransition("draft", "running")).toBe(false);
  });
  it("allows cancelled→archived", () => {
    expect(canTransition("cancelled", "archived")).toBe(true);
  });
  it("assertTransition throws on illegal", () => {
    expect(() => assertTransition("ready", "running")).toThrow(
      InvalidTransitionError,
    );
  });
  it("assertTransition is a no-op on same state", () => {
    expect(() => assertTransition("draft", "draft")).not.toThrow();
  });
});

describe("applyUpdate", () => {
  it("applies field changes", () => {
    const c = applyUpdate({ status: "draft" }, { title: "New", priority: "high" });
    expect(c.title).toBe("New");
    expect(c.priority).toBe("high");
  });
  it("confirms draft→ready", () => {
    const c = applyUpdate({ status: "draft" }, { status: "ready" });
    expect(c.status).toBe("ready");
  });
  it("rejects illegal transition", () => {
    expect(() => applyUpdate({ status: "ready" }, { status: "running" })).toThrow(
      InvalidTransitionError,
    );
  });
  it("stamps archived_at when archiving", () => {
    const c = applyUpdate({ status: "cancelled" }, { status: "archived" });
    expect(c.status).toBe("archived");
    expect(typeof c.archived_at).toBe("string");
  });
  it("ignores same-state status (no transition recorded)", () => {
    const c = applyUpdate({ status: "draft" }, { status: "draft" });
    expect(c.status).toBeUndefined();
  });
  it("validates patched title", () => {
    expect(() => applyUpdate({ status: "draft" }, { title: "" })).toThrow(
      ValidationError,
    );
  });
  it("normalizes owner_id null", () => {
    const c = applyUpdate({ status: "draft" }, { owner_id: null });
    expect(c.owner_id).toBeNull();
  });
});
