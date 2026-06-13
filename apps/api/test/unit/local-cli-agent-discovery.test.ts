import { describe, expect, it } from "vitest";
import {
  discoverLocalCliAgents,
  type LocalCliProbe,
} from "../../src/application/runtime/local-cli-agent-discovery.js";
import { seedLocalCliAgents } from "../../src/application/runtime/local-cli-agent-seed.js";
import { listLocalCliAgentSpecs } from "../../src/application/runtime/local-cli-agent-registry.js";
import type { AgentProfileService } from "../../src/application/agent-profile.service.js";

describe("discoverLocalCliAgents", () => {
  it("探测可用 CLI（probe exit 0 即 available）", async () => {
    const probe: LocalCliProbe = async (command) =>
      command === "claude" ? { ok: true, detail: "1.0.0" } : { ok: false, detail: "command not found" };
    const results = await discoverLocalCliAgents([], probe);
    const claude = results.find((r) => r.provider === "claude_code");
    expect(claude).toBeDefined();
    expect(claude!.available).toBe(true);
    expect(claude!.detail).toBe("1.0.0");
  });

  it("probe 失败标记为不可用，不抛错", async () => {
    const probe: LocalCliProbe = async () => ({ ok: false, detail: "command not found" });
    const results = await discoverLocalCliAgents(["claude_code"], probe);
    expect(results[0]!.available).toBe(false);
  });

  it("未知 provider 被忽略", async () => {
    const probe: LocalCliProbe = async () => ({ ok: true, detail: "ok" });
    const results = await discoverLocalCliAgents(["does_not_exist"], probe);
    expect(results).toHaveLength(0);
  });
});

// 轻量 fake：只实现种子用到的 listProfiles / createProfile。
function fakeService(existingNames: string[] = []): {
  service: AgentProfileService;
  created: { name: string; constraints: Record<string, unknown> }[];
} {
  const created: { name: string; constraints: Record<string, unknown> }[] = [];
  const rows = existingNames.map((name) => ({ name }));
  const service = {
    listProfiles: async () => rows,
    createProfile: async (_ctx: unknown, input: { name: string; constraints: Record<string, unknown> }) => {
      created.push({ name: input.name, constraints: input.constraints });
      return { id: `id-${input.name}`, name: input.name };
    },
  } as unknown as AgentProfileService;
  return { service, created };
}

const ctx = { projectId: "p1", actorId: "u1", requestId: "test" };

describe("seedLocalCliAgents", () => {
  it("为每个 spec 幂等创建 profile，provider 落 constraints", async () => {
    const { service, created } = fakeService();
    const result = await seedLocalCliAgents(service, ctx, listLocalCliAgentSpecs());
    expect(result.created).toContain("claude_code");
    const claude = created.find((c) => c.constraints.provider === "claude_code");
    expect(claude).toBeDefined();
    expect(claude!.constraints).toMatchObject({ provider: "claude_code", transport: "local_cli" });
  });

  it("已存在同名 profile 时跳过，不重复创建", async () => {
    const allNames = listLocalCliAgentSpecs().map((s) => s.displayName);
    const { service, created } = fakeService(allNames);
    const result = await seedLocalCliAgents(service, ctx, listLocalCliAgentSpecs());
    expect(result.skipped).toContain("claude_code");
    expect(created).toHaveLength(0);
  });

  it("空 spec 集合直接返回，不查库", async () => {
    const { service, created } = fakeService();
    const result = await seedLocalCliAgents(service, ctx, []);
    expect(result).toEqual({ created: [], skipped: [] });
    expect(created).toHaveLength(0);
  });
});
