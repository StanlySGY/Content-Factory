import { describe, expect, it } from "vitest";
import { validateDAG } from "../../src/domain/workflow/dag.js";

const S = (...ids: string[]) => ids.map((id) => ({ id }));
const D = (stageId: string, dependsOnStageId: string) => ({ stageId, dependsOnStageId });

describe("validateDAG", () => {
  it("accepts a single stage with no dependencies", () => {
    expect(validateDAG(S("a"), []).valid).toBe(true);
  });
  it("accepts a linear chain a->b->c", () => {
    const r = validateDAG(S("a", "b", "c"), [D("b", "a"), D("c", "b")]);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
  it("accepts a join a->c, b->c", () => {
    expect(validateDAG(S("a", "b", "c"), [D("c", "a"), D("c", "b")]).valid).toBe(true);
  });
  it("detects self dependency", () => {
    const r = validateDAG(S("a", "b"), [D("a", "a"), D("b", "a")]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.type === "self_dependency")).toBe(true);
  });
  it("detects a cycle a->b->a", () => {
    const r = validateDAG(S("a", "b"), [D("b", "a"), D("a", "b")]);
    expect(r.valid).toBe(false);
    const cyc = r.errors.find((e) => e.type === "cycle");
    expect(cyc).toBeDefined();
    expect(cyc!.stageIds.sort()).toEqual(["a", "b"]);
  });
  it("detects a longer cycle a->b->c->a", () => {
    const r = validateDAG(S("a", "b", "c"), [D("b", "a"), D("c", "b"), D("a", "c")]);
    expect(r.errors.some((e) => e.type === "cycle")).toBe(true);
  });
  it("detects isolated node when multiple stages", () => {
    const r = validateDAG(S("a", "b", "c"), [D("b", "a")]);
    const iso = r.errors.find((e) => e.type === "isolated_node");
    expect(iso?.stageIds).toEqual(["c"]);
  });
  it("detects unknown stage references", () => {
    const r = validateDAG(S("a"), [D("a", "ghost")]);
    expect(r.errors.some((e) => e.type === "unknown_stage")).toBe(true);
  });
});
