import { describe, expect, it } from "vitest";
import {
  ExternalPlaceholderRuntimeSecretResolver,
  type RuntimeSecretResolverContext,
} from "../../src/application/runtime/credential-resolver.js";
import {
  buildTransportLocalSecretHeaderPlan,
} from "../../src/application/runtime/runtime-secret-injection-preflight.js";

const ref = {
  provider: "openai_compatible",
  keyRef: "secret://llm/openai-compatible",
  scope: "project" as const,
  purpose: "agent_runtime" as const,
  subject: { type: "workflow_stage_run", id: "stage-1" },
};

const context: RuntimeSecretResolverContext = {
  jobId: "job-1",
  jobType: "agent",
  adapterMode: "real",
  runtimeMode: "real_enabled",
  requestId: "req-1",
};

describe("Runtime secret injection preflight", () => {
  it("keeps the external placeholder resolver fail-closed and material-free", async () => {
    const resolution = await new ExternalPlaceholderRuntimeSecretResolver().resolve(ref, context);

    expect(resolution).toMatchObject({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai-compatible",
      purpose: "agent_runtime",
      resolved: false,
      materialAvailable: false,
      materialPreview: null,
      resolverKind: "external_placeholder",
      auditMetadata: {
        resolver_kind: "external_placeholder",
        secret_material_present: false,
        secret_material_returned: false,
        plain_env_read: false,
        network_used: false,
        process_spawned: false,
      },
    });
    expect(JSON.stringify(resolution)).not.toContain("Bearer");
    expect(JSON.stringify(resolution)).not.toContain("sk-");
  });

  it("builds a transport-local header plan without persistable secret material", async () => {
    const resolution = await new ExternalPlaceholderRuntimeSecretResolver().resolve(ref, context);
    const plan = buildTransportLocalSecretHeaderPlan({
      ref,
      resolution,
      targetHeaderName: "authorization",
    });

    expect(plan).toEqual({
      targetHeaderName: "authorization",
      transportOnlyHeaderNames: ["authorization"],
      persistableHeadersSnapshot: { authorization_ref: "secret://llm/openai-compatible" },
      secretMaterialInjected: false,
      secretMaterialPersistable: false,
      dtoExposureAllowed: false,
      ledgerSnapshotAllowed: false,
      outboxPayloadAllowed: false,
    });
    expect(JSON.stringify(plan)).not.toContain("Bearer");
    expect(JSON.stringify(plan)).not.toContain("sk-");
  });
});
