import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  assertNoSecretMaterialReturned,
  buildSecretResolutionAuditMetadata,
  type RuntimeSecretResolution,
  validateRuntimeSecretRef,
  validateRuntimeSecretResolution,
} from "../../src/application/runtime/credential-resolver.js";

const ref = {
  provider: "openai_compatible",
  keyRef: "secret://llm/openai-compatible",
  scope: "project" as const,
  purpose: "agent_runtime" as const,
  subject: { type: "workflow_stage_run", id: "stage-1" },
};

describe("Runtime secret resolver contract", () => {
  it("validates secret refs and rejects inline secret material", () => {
    expect(() => validateRuntimeSecretRef(ref)).not.toThrow();
    expect(() => validateRuntimeSecretRef({ ...ref, keyRef: "sk-live-secret" })).toThrow(ValidationError);
    expect(() => validateRuntimeSecretRef({ ...ref, purpose: "unknown" as never })).toThrow(ValidationError);
  });

  it("validates unresolved resolutions and forbids returned material", () => {
    const auditMetadata = buildSecretResolutionAuditMetadata(ref, "mock");
    const resolution = {
      provider: ref.provider,
      keyRef: ref.keyRef,
      scope: ref.scope,
      purpose: ref.purpose,
      resolved: false,
      materialAvailable: false,
      materialPreview: null,
      resolverKind: "mock" as const,
      auditMetadata,
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
    };

    expect(auditMetadata).toMatchObject({
      resolver_kind: "mock",
      secret_material_present: false,
      secret_material_returned: false,
      plain_env_read: false,
      key_ref_scheme: "secret://",
      requested_purpose: "agent_runtime",
      network_used: false,
      process_spawned: false,
    });
    expect(() => validateRuntimeSecretResolution(resolution)).not.toThrow();
    expect(() => assertNoSecretMaterialReturned(resolution)).not.toThrow();
    const unsafeResolution = { ...resolution, materialPreview: "sk-live-secret" } as unknown as RuntimeSecretResolution;
    expect(() => assertNoSecretMaterialReturned(unsafeResolution)).toThrow(ValidationError);
  });
});
