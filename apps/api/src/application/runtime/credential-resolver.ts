import {
  validateRuntimeCredentialRef,
  type RuntimeCredentialRef,
} from "../../domain/execution/runtime-safety.js";

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
