import { execFile } from "node:child_process";
import {
  listLocalCliAgentSpecs,
  findLocalCliAgentSpec,
  type LocalCliAgentSpec,
} from "./local-cli-agent-registry.js";

// 本地 CLI Agent 发现器：以 probeArgs 探测宿主 PATH 中哪些 agentic CLI 可用（exit 0 即可用）。
// 仅做可用性探测，不发 prompt、不读密钥；供启动种子与 ops 只读展示复用。

export interface LocalCliDiscoveryResult {
  provider: string;
  displayName: string;
  command: string;
  available: boolean;
  detail: string;
}

export type LocalCliProbe = (command: string, args: string[]) => Promise<{ ok: boolean; detail: string }>;

const defaultProbe: LocalCliProbe = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        const code = (error as { code?: unknown }).code;
        resolve({ ok: false, detail: code === "ENOENT" ? "command not found" : `probe failed: ${String(code ?? error.message)}` });
        return;
      }
      resolve({ ok: true, detail: stdout.trim().slice(0, 120) || "available" });
    });
  });

// 解析目标 spec 集合：providers 为空 → 全注册表；否则按 provider 过滤（未知 provider 忽略）。
function resolveSpecs(providers: string[]): LocalCliAgentSpec[] {
  if (providers.length === 0) return [...listLocalCliAgentSpecs()];
  return providers
    .map((p) => findLocalCliAgentSpec(p))
    .filter((s): s is LocalCliAgentSpec => s !== null);
}

export async function discoverLocalCliAgents(
  providers: string[] = [],
  probe: LocalCliProbe = defaultProbe,
): Promise<LocalCliDiscoveryResult[]> {
  const specs = resolveSpecs(providers);
  return Promise.all(
    specs.map(async (spec) => {
      const { ok, detail } = await probe(spec.command, spec.probeArgs);
      return { provider: spec.provider, displayName: spec.displayName, command: spec.command, available: ok, detail };
    }),
  );
}
