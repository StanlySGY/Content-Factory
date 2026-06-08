import { ValidationError } from "../../domain/errors.js";

export interface SecretResolutionPolicy {
  mode: "mock_only";
  allowedSchemes: string[];
  allowPlainEnvRead: boolean;
  requireAuditMetadata: boolean;
}

export interface SecretResolutionReadinessSnapshot {
  mode: "mock_only";
  allowed_schemes: string[];
  resolver_ready: false;
  secret_material_present: false;
  audit_metadata_required: boolean;
}

export const DEFAULT_SECRET_RESOLUTION_POLICY: SecretResolutionPolicy = {
  mode: "mock_only",
  allowedSchemes: ["secret://", "vault://", "env://"],
  allowPlainEnvRead: false,
  requireAuditMetadata: true,
};

export function validateSecretResolutionPolicy(policy: SecretResolutionPolicy): void {
  if (policy.mode !== "mock_only") throw new ValidationError("secret resolution policy must be mock_only");
  if (!Array.isArray(policy.allowedSchemes) || policy.allowedSchemes.length === 0)
    throw new ValidationError("secret resolution allowedSchemes are required");
  for (const scheme of policy.allowedSchemes) {
    if (typeof scheme !== "string" || !scheme.endsWith("://"))
      throw new ValidationError(`invalid secret resolution scheme: ${String(scheme)}`);
  }
  if (typeof policy.allowPlainEnvRead !== "boolean")
    throw new ValidationError("secret resolution allowPlainEnvRead must be boolean");
  if (typeof policy.requireAuditMetadata !== "boolean")
    throw new ValidationError("secret resolution requireAuditMetadata must be boolean");
}

export function assertSecretResolutionAllowed(policy: SecretResolutionPolicy): void {
  validateSecretResolutionPolicy(policy);
  if (policy.allowPlainEnvRead) throw new ValidationError("plain env secret reads are not allowed in preflight");
}

export function buildSecretResolutionReadinessSnapshot(
  policy: SecretResolutionPolicy = DEFAULT_SECRET_RESOLUTION_POLICY,
): SecretResolutionReadinessSnapshot {
  assertSecretResolutionAllowed(policy);
  return {
    mode: "mock_only",
    allowed_schemes: [...policy.allowedSchemes],
    resolver_ready: false,
    secret_material_present: false,
    audit_metadata_required: policy.requireAuditMetadata,
  };
}
