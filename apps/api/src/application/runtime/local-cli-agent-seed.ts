import type { AgentProfileService, RequestContext } from "../agent-profile.service.js";
import type { LocalCliAgentSpec } from "./local-cli-agent-registry.js";

// 本地 CLI Agent 种子：把发现到的可用 CLI 幂等写入 agent_profiles。
// 幂等键 = profile.name（按发现 spec 的 displayName）；已存在则跳过，不覆盖用户改动。
// provider 标记落 constraints.provider，供执行时构造 credentialRef.provider 选择 runtime。

export interface LocalCliSeedResult {
  created: string[];
  skipped: string[];
}

export async function seedLocalCliAgents(
  service: AgentProfileService,
  ctx: RequestContext,
  specs: readonly LocalCliAgentSpec[],
): Promise<LocalCliSeedResult> {
  const result: LocalCliSeedResult = { created: [], skipped: [] };
  if (specs.length === 0) return result;
  const existing = await service.listProfiles(ctx);
  const existingNames = new Set(existing.map((p) => p.name));
  for (const spec of specs) {
    if (existingNames.has(spec.displayName)) {
      result.skipped.push(spec.provider);
      continue;
    }
    await service.createProfile(ctx, {
      name: spec.displayName,
      description: `本地 CLI Agent（${spec.command}），启动时自动发现`,
      capabilities: { tools: [] },
      constraints: { provider: spec.provider, transport: "local_cli", command: spec.command },
    });
    result.created.push(spec.provider);
  }
  return result;
}
