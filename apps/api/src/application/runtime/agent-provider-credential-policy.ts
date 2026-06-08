import { ValidationError } from "../../domain/errors.js";
import {
  validateRuntimeCredentialRef,
  type RuntimeCredentialRef,
} from "../../domain/execution/runtime-safety.js";

export interface RuntimeCredentialResolution {
  provider: string;
  scope: RuntimeCredentialRef["scope"];
  keyRef: string;
  resolved: boolean;
  secretMaterialPresent: boolean;
  metadata: Record<string, unknown>;
}

const SECRET_KEY_MARKERS = ["secret", "token", "api_key", "apikey", "password", "credential", "authorization"] as const;
const SAFE_REF_PATTERN = /^(secret|vault|env):\/\//;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isSecretKey(key: string): boolean {
  const normalized = key.replace(/[-\s]/g, "_").toLowerCase();
  if (normalized === "key_ref" || normalized === "keyref") return false;
  return SECRET_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

export function validateAgentCredentialRef(ref: RuntimeCredentialRef): void {
  validateRuntimeCredentialRef(ref);
}

export function assertNoInlineCredentialMaterial(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoInlineCredentialMaterial(item);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (isSecretKey(key)) throw new ValidationError(`inline credential material is not allowed: ${key}`);
    if (typeof nested === "string" && /^(sk-|pk_|Bearer\s+)/i.test(nested) && !SAFE_REF_PATTERN.test(nested))
      throw new ValidationError("inline credential material is not allowed");
    assertNoInlineCredentialMaterial(nested);
  }
}

export function buildCredentialResolutionSnapshot(ref: RuntimeCredentialRef): RuntimeCredentialResolution {
  validateAgentCredentialRef(ref);
  return {
    provider: ref.provider,
    keyRef: ref.keyRef,
    scope: ref.scope,
    resolved: false,
    secretMaterialPresent: false,
    metadata: { resolver: "mock", phase: "preflight" },
  };
}
