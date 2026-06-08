import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  assertSecretResolutionAllowed,
  buildSecretResolutionReadinessSnapshot,
  validateSecretResolutionPolicy,
} from "../../src/application/runtime/secret-resolution-policy.js";

describe("Secret resolution policy", () => {
  it("rejects plain env reads and builds readiness snapshots without material", () => {
    const policy = {
      mode: "mock_only" as const,
      allowedSchemes: ["secret://", "vault://", "env://"],
      allowPlainEnvRead: false,
      requireAuditMetadata: true,
    };
    expect(() => validateSecretResolutionPolicy(policy)).not.toThrow();
    expect(() => assertSecretResolutionAllowed(policy)).not.toThrow();
    expect(() => assertSecretResolutionAllowed({ ...policy, allowPlainEnvRead: true })).toThrow(ValidationError);

    expect(buildSecretResolutionReadinessSnapshot(policy)).toEqual({
      mode: "mock_only",
      allowed_schemes: ["secret://", "vault://", "env://"],
      resolver_ready: false,
      secret_material_present: false,
      audit_metadata_required: true,
    });
  });
});
