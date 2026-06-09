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
  resolved: boolean;
  material?: string;
  metadata: Record<string, unknown>;
}

export interface IRuntimeCredentialResolver {
  resolve(ref: RuntimeCredentialRef): Promise<ResolvedRuntimeCredential>;
}

export interface ExternalSecretRegistryEntry {
  keyRef: string;
  materialSourceRef: string;
  materialEnvName: string;
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

function envNameFromKeyRef(keyRef: string): string | null {
  if (!keyRef.startsWith("env://")) return null;
  const name = keyRef.slice("env://".length);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new ValidationError("runtime env credential ref must use an env var name");
  return name;
}

function schemeFromRef(ref: string): string {
  return ref.includes("://") ? ref.split("://", 1)[0] + "://" : "unknown";
}

function isExternalRegistryKeyRef(ref: string): boolean {
  return ref.startsWith("secret://") || ref.startsWith("vault://");
}

function looksLikeInlineSecret(value: string): boolean {
  const trimmed = value.trim();
  return /^Bearer\s+\S+/i.test(trimmed) || /^sk-[A-Za-z0-9_-]{6,}/.test(trimmed);
}

export function validateExternalSecretRegistryEntry(entry: string): ExternalSecretRegistryEntry {
  const raw = entry.trim();
  if (raw.length === 0) throw new ValidationError("external secret registry entry is required");
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === raw.length - 1)
    throw new ValidationError("external secret registry entry must use keyRef=env://ENV_NAME");

  const keyRef = raw.slice(0, separatorIndex).trim();
  const materialSourceRef = raw.slice(separatorIndex + 1).trim();
  if (looksLikeInlineSecret(keyRef) || looksLikeInlineSecret(materialSourceRef))
    throw new ValidationError("inline secret material is not allowed in external secret registry");
  if (!isExternalRegistryKeyRef(keyRef))
    throw new ValidationError("external secret registry key ref must use secret:// or vault://");
  const materialEnvName = envNameFromKeyRef(materialSourceRef);
  if (!materialEnvName) throw new ValidationError("external secret registry entry must map to env://ENV_NAME");
  return { keyRef, materialSourceRef, materialEnvName };
}

export function parseExternalSecretRegistry(entries: string[]): ExternalSecretRegistryEntry[] {
  const parsed = entries.map(validateExternalSecretRegistryEntry);
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (seen.has(entry.keyRef)) throw new ValidationError(`duplicate external secret registry key ref: ${entry.keyRef}`);
    seen.add(entry.keyRef);
  }
  return parsed;
}

export class EnvRuntimeCredentialResolver implements IRuntimeCredentialResolver {
  constructor(
    private readonly source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
    private readonly registry: string[] = [],
  ) {}

  async resolve(ref: RuntimeCredentialRef): Promise<ResolvedRuntimeCredential> {
    validateRuntimeCredentialRef(ref);
    if (this.registry.length > 0 && !this.registry.includes(ref.keyRef)) {
      return {
        provider: ref.provider,
        scope: ref.scope,
        keyRef: ref.keyRef,
        resolved: false,
        material: undefined,
        metadata: {
          resolver_kind: "env",
          key_ref_scheme: schemeFromRef(ref.keyRef),
          failure_reason: "key_ref_not_registered",
          secret_material_present: false,
          secret_material_returned_to_transport: false,
        },
      };
    }
    const envName = envNameFromKeyRef(ref.keyRef);
    if (!envName) {
      return {
        provider: ref.provider,
        scope: ref.scope,
        keyRef: ref.keyRef,
        resolved: false,
        material: undefined,
        metadata: {
          resolver_kind: "env",
          key_ref_scheme: schemeFromRef(ref.keyRef),
          failure_reason: "unsupported_key_ref_scheme",
          secret_material_present: false,
          secret_material_returned_to_transport: false,
        },
      };
    }
    const material = this.source[envName];
    if (typeof material !== "string" || material.trim().length === 0) {
      return {
        provider: ref.provider,
        scope: ref.scope,
        keyRef: ref.keyRef,
        resolved: false,
        material: undefined,
        metadata: {
          resolver_kind: "env",
          key_ref_scheme: "env://",
          env_name: envName,
          failure_reason: "missing_env_var",
          secret_material_present: false,
          secret_material_returned_to_transport: false,
        },
      };
    }
    return {
      provider: ref.provider,
      scope: ref.scope,
      keyRef: ref.keyRef,
      resolved: true,
      material,
      metadata: {
        resolver_kind: "env",
        key_ref_scheme: "env://",
        env_name: envName,
        secret_material_present: true,
        secret_material_returned_to_transport: true,
      },
    };
  }
}

export class ExternalRegistryCredentialResolver implements IRuntimeCredentialResolver {
  private readonly registry: Map<string, ExternalSecretRegistryEntry>;

  constructor(
    private readonly source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
    registryEntries: string[] = [],
  ) {
    this.registry = new Map(parseExternalSecretRegistry(registryEntries).map((entry) => [entry.keyRef, entry]));
  }

  async resolve(ref: RuntimeCredentialRef): Promise<ResolvedRuntimeCredential> {
    validateRuntimeCredentialRef(ref);
    const keyRefScheme = schemeFromRef(ref.keyRef);
    const baseMetadata = {
      resolver_kind: "external_registry",
      key_ref_scheme: keyRefScheme,
      material_source_scheme: "env://",
      secret_material_present: false,
      secret_material_returned_to_transport: false,
      network_used: false,
      process_spawned: false,
    };

    if (!isExternalRegistryKeyRef(ref.keyRef)) {
      return {
        provider: ref.provider,
        scope: ref.scope,
        keyRef: ref.keyRef,
        resolved: false,
        material: undefined,
        metadata: {
          ...baseMetadata,
          failure_reason: "unsupported_key_ref_scheme",
        },
      };
    }

    const entry = this.registry.get(ref.keyRef);
    if (!entry) {
      return {
        provider: ref.provider,
        scope: ref.scope,
        keyRef: ref.keyRef,
        resolved: false,
        material: undefined,
        metadata: {
          ...baseMetadata,
          failure_reason: "key_ref_not_registered",
        },
      };
    }

    const material = this.source[entry.materialEnvName];
    if (typeof material !== "string" || material.trim().length === 0) {
      return {
        provider: ref.provider,
        scope: ref.scope,
        keyRef: ref.keyRef,
        resolved: false,
        material: undefined,
        metadata: {
          ...baseMetadata,
          material_source_ref: entry.materialSourceRef,
          material_env_name: entry.materialEnvName,
          failure_reason: "missing_env_var",
        },
      };
    }

    return {
      provider: ref.provider,
      scope: ref.scope,
      keyRef: ref.keyRef,
      resolved: true,
      material,
      metadata: {
        ...baseMetadata,
        material_source_ref: entry.materialSourceRef,
        material_env_name: entry.materialEnvName,
        secret_material_present: true,
        secret_material_returned_to_transport: true,
      },
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
