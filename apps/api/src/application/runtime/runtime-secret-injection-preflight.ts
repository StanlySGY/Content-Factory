import { ValidationError } from "../../domain/errors.js";
import {
  assertNoSecretMaterialReturned,
  type RuntimeSecretRef,
  type RuntimeSecretResolution,
  validateRuntimeSecretRef,
  validateRuntimeSecretResolution,
} from "./credential-resolver.js";

export interface TransportLocalSecretHeaderPlan {
  targetHeaderName: string;
  transportOnlyHeaderNames: string[];
  persistableHeadersSnapshot: Record<string, string>;
  secretMaterialInjected: false;
  secretMaterialPersistable: false;
  dtoExposureAllowed: false;
  ledgerSnapshotAllowed: false;
  outboxPayloadAllowed: false;
}

export interface TransportLocalSecretHeaderPlanInput {
  ref: RuntimeSecretRef;
  resolution: RuntimeSecretResolution;
  targetHeaderName: string;
}

const SAFE_HEADER_NAME = /^[a-z][a-z0-9_-]*$/;

function normalizeHeaderName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!SAFE_HEADER_NAME.test(normalized)) throw new ValidationError(`invalid transport header name: ${name}`);
  return normalized;
}

function assertMatchingResolution(ref: RuntimeSecretRef, resolution: RuntimeSecretResolution): void {
  if (resolution.provider !== ref.provider || resolution.keyRef !== ref.keyRef || resolution.purpose !== ref.purpose)
    throw new ValidationError("runtime secret resolution does not match requested ref");
}

export function buildTransportLocalSecretHeaderPlan(
  input: TransportLocalSecretHeaderPlanInput,
): TransportLocalSecretHeaderPlan {
  validateRuntimeSecretRef(input.ref);
  validateRuntimeSecretResolution(input.resolution);
  assertNoSecretMaterialReturned(input.resolution);
  assertMatchingResolution(input.ref, input.resolution);

  const targetHeaderName = normalizeHeaderName(input.targetHeaderName);
  return {
    targetHeaderName,
    transportOnlyHeaderNames: [targetHeaderName],
    persistableHeadersSnapshot: { [`${targetHeaderName}_ref`]: input.ref.keyRef },
    secretMaterialInjected: false,
    secretMaterialPersistable: false,
    dtoExposureAllowed: false,
    ledgerSnapshotAllowed: false,
    outboxPayloadAllowed: false,
  };
}
