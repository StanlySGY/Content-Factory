import { describe, expect, it } from "vitest";
import {
  MockRuntimeSecretResolver,
  type RuntimeSecretResolverContext,
} from "../../src/application/runtime/credential-resolver.js";

const context: RuntimeSecretResolverContext = {
  jobId: "job-1",
  jobType: "agent",
  adapterMode: "provider_preflight",
  runtimeMode: "real_enabled",
  requestId: "req-1",
};

describe("MockRuntimeSecretResolver", () => {
  it("returns an unresolved resolution without secret material", async () => {
    const resolved = await new MockRuntimeSecretResolver().resolve({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai-compatible",
      scope: "project",
      purpose: "agent_runtime",
    }, context);

    expect(resolved).toMatchObject({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai-compatible",
      scope: "project",
      purpose: "agent_runtime",
      resolved: false,
      materialAvailable: false,
      materialPreview: null,
      resolverKind: "mock",
      auditMetadata: {
        resolver_kind: "mock",
        secret_material_present: false,
        secret_material_returned: false,
        plain_env_read: false,
        network_used: false,
        process_spawned: false,
      },
    });
    expect(JSON.stringify(resolved)).not.toContain("sk-");
    expect(JSON.stringify(resolved).toLowerCase()).not.toContain("bearer ");
  });
});
