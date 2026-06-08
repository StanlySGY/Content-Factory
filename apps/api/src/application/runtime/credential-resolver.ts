import type { ExecutionJobType, RuntimeAdapterMode, RuntimeMode } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import {
  validateRuntimeCredentialRef,
  type RuntimeCredentialRef,
} from "../../domain/execution/runtime-safety.js";

export const RUNTIME_SECRET_PURPOSES = ["agent_runtime", "mcp_runtime", "publisher_runtime"] as const;
export type RuntimeSecretPurpose = (typeof RUNTIME_SECRET_PURPOSES)[number];
export type RuntimeSecretResolverKind = "mock" | "external_placeholder";

export interface RuntimeSecretRef extends RuntimeCredentialRef {
  purpose: RuntimeSecretPurpose;
  subject?: Record<string, unknown>;
}

export interface RuntimeSecretResolutionAuditMetadata {
  resolver_kind: RuntimeSecretResolverKind;
  secret_material_present: false;
  secret_material_returned: false;
  plain_env_read: false;
  key_ref_scheme: "secret://" | "vault://" | "env://";
  requested_purpose: RuntimeSecretPurpose;
  network_used: false;
  process_spawned: false;
}

export interface RuntimeSecretResolution {
  provider: string;
  keyRef: string;
  scope: RuntimeCredentialRef["scope"];
  purpose: RuntimeSecretPurpose;
  resolved: boolean;
  materialAvailable: boolean;
  materialPreview: null;
  resolverKind: RuntimeSecretResolverKind;
  auditMetadata: RuntimeSecretResolutionAuditMetadata;
  createdAt: Date;
}

export interface RuntimeSecretResolverContext {
  jobId: string;
  jobType: ExecutionJobType;
  adapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeMode;
  requestId?: string;
  auditMetadata?: Record<string, unknown>;
}

export interface ResolvedRuntimeCredential {
  provider: string;
  scope: RuntimeCredentialRef["scope"];
  keyRef: string;
  resolved: false;
  metadata: Record<string, unknown>;
}

export interface IRuntimeCredentialResolver {
  resolve(ref: RuntimeCredentialRef): Promise<ResolvedRuntimeCredential>;
}

export interface IRuntimeSecretResolver {
  resolve(ref: RuntimeSecretRef, context: RuntimeSecretResolverContext): Promise<RuntimeSecretResolution>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function keyRefScheme(keyRef: string): RuntimeSecretResolutionAuditMetadata["key_ref_scheme"] {
  if (keyRef.startsWith("secret://")) return "secret://";
  if (keyRef.startsWith("vault://")) return "vault://";
  if (keyRef.startsWith("env://")) return "env://";
  throw new ValidationError("runtime secret keyRef must be a reference, not an inline secret");
}

function validateResolverContext(context: RuntimeSecretResolverContext): void {
  if (!context.jobId || context.jobId.trim().length === 0)
    throw new ValidationError("runtime secret resolver jobId is required");
  if (!["agent", "mcp", "publisher"].includes(context.jobType))
    throw new ValidationError(`invalid runtime secret resolver jobType: ${context.jobType}`);
  if (!["mock", "dry_run", "fake_provider", "provider_preflight", "real"].includes(context.adapterMode))
    throw new ValidationError(`invalid runtime secret resolver adapterMode: ${context.adapterMode}`);
  if (!["mock", "real_disabled", "real_enabled"].includes(context.runtimeMode))
    throw new ValidationError(`invalid runtime secret resolver runtimeMode: ${context.runtimeMode}`);
}

export function validateRuntimeSecretRef(ref: RuntimeSecretRef): void {
  validateRuntimeCredentialRef(ref);
  keyRefScheme(ref.keyRef);
  if (!RUNTIME_SECRET_PURPOSES.includes(ref.purpose))
    throw new ValidationError(`invalid runtime secret purpose: ${String(ref.purpose)}`);
  if (ref.subject !== undefined && !isPlainObject(ref.subject))
    throw new ValidationError("runtime secret subject must be an object");
}

export function buildSecretResolutionAuditMetadata(
  ref: RuntimeSecretRef,
  resolverKind: RuntimeSecretResolverKind,
): RuntimeSecretResolutionAuditMetadata {
  validateRuntimeSecretRef(ref);
  if (resolverKind !== "mock" && resolverKind !== "external_placeholder")
    throw new ValidationError(`invalid runtime secret resolver kind: ${String(resolverKind)}`);
  return {
    resolver_kind: resolverKind,
    secret_material_present: false,
    secret_material_returned: false,
    plain_env_read: false,
    key_ref_scheme: keyRefScheme(ref.keyRef),
    requested_purpose: ref.purpose,
    network_used: false,
    process_spawned: false,
  };
}

export function assertNoSecretMaterialReturned(resolution: RuntimeSecretResolution): void {
  if (resolution.materialAvailable)
    throw new ValidationError("runtime secret resolver must not expose material availability in preflight");
  if (resolution.materialPreview !== null)
    throw new ValidationError("runtime secret resolver must not return secret material in preflight");
  if (resolution.auditMetadata.secret_material_present || resolution.auditMetadata.secret_material_returned)
    throw new ValidationError("runtime secret resolver audit metadata indicates secret material");
}

export function validateRuntimeSecretResolution(resolution: RuntimeSecretResolution): void {
  validateRuntimeSecretRef({
    provider: resolution.provider,
    keyRef: resolution.keyRef,
    scope: resolution.scope,
    purpose: resolution.purpose,
  });
  if (typeof resolution.resolved !== "boolean") throw new ValidationError("runtime secret resolved must be boolean");
  if (typeof resolution.materialAvailable !== "boolean")
    throw new ValidationError("runtime secret materialAvailable must be boolean");
  if (resolution.resolverKind !== "mock" && resolution.resolverKind !== "external_placeholder")
    throw new ValidationError(`invalid runtime secret resolver kind: ${String(resolution.resolverKind)}`);
  if (!(resolution.createdAt instanceof Date) || Number.isNaN(resolution.createdAt.getTime()))
    throw new ValidationError("runtime secret resolution createdAt must be a valid Date");
  assertNoSecretMaterialReturned(resolution);
}

export class MockCredentialResolver implements IRuntimeCredentialResolver {
  async resolve(ref: RuntimeCredentialRef): Promise<ResolvedRuntimeCredential> {
    validateRuntimeCredentialRef(ref);
    return {
      provider: ref.provider,
      scope: ref.scope,
      keyRef: ref.keyRef,
      resolved: false,
      metadata: { mock: true },
    };
  }
}

export class MockRuntimeSecretResolver implements IRuntimeSecretResolver {
  async resolve(ref: RuntimeSecretRef, context: RuntimeSecretResolverContext): Promise<RuntimeSecretResolution> {
    validateRuntimeSecretRef(ref);
    validateResolverContext(context);
    const resolution: RuntimeSecretResolution = {
      provider: ref.provider,
      scope: ref.scope,
      keyRef: ref.keyRef,
      purpose: ref.purpose,
      resolved: false,
      materialAvailable: false,
      materialPreview: null,
      resolverKind: "mock",
      auditMetadata: buildSecretResolutionAuditMetadata(ref, "mock"),
      createdAt: new Date(),
    };
    validateRuntimeSecretResolution(resolution);
    return resolution;
  }
}

export class ExternalPlaceholderRuntimeSecretResolver implements IRuntimeSecretResolver {
  async resolve(ref: RuntimeSecretRef, context: RuntimeSecretResolverContext): Promise<RuntimeSecretResolution> {
    validateRuntimeSecretRef(ref);
    validateResolverContext(context);
    const resolution: RuntimeSecretResolution = {
      provider: ref.provider,
      scope: ref.scope,
      keyRef: ref.keyRef,
      purpose: ref.purpose,
      resolved: false,
      materialAvailable: false,
      materialPreview: null,
      resolverKind: "external_placeholder",
      auditMetadata: buildSecretResolutionAuditMetadata(ref, "external_placeholder"),
      createdAt: new Date(),
    };
    validateRuntimeSecretResolution(resolution);
    return resolution;
  }
}
