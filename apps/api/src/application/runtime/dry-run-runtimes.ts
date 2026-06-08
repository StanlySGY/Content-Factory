import type { ExecutionJobType } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import {
  failedRuntimeResponse,
  validateRuntimeRequest,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../../domain/execution/runtime-contract.js";
import {
  validateRuntimeCredentialRef,
  type RuntimeCredentialRef,
  type RuntimeExecutionContext,
} from "../../domain/execution/runtime-safety.js";
import { createDefaultRuntimeAdapterRegistry } from "./adapter-registry.js";
import { MockCredentialResolver } from "./credential-resolver.js";
import type { IAgentRuntime, IMCPRuntime, IPublisherRuntime } from "./ports.js";

function runtimeError(jobId: string, errorType: "permission_denied" | "validation_error", error: string): RuntimeResponse {
  return {
    ...failedRuntimeResponse(jobId, errorType, error),
    metadata: { mode: "dry_run", networkAllowed: false, processSpawnAllowed: false },
  };
}

function credentialFromMetadata(value: unknown): RuntimeCredentialRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ref = value as { provider?: unknown; keyRef?: unknown; key_ref?: unknown; scope?: unknown };
  const keyRef = ref.keyRef ?? ref.key_ref;
  if (typeof ref.provider !== "string" || typeof keyRef !== "string" || typeof ref.scope !== "string") {
    throw new ValidationError("runtime credential ref is invalid");
  }
  return { provider: ref.provider, keyRef, scope: ref.scope as RuntimeCredentialRef["scope"] };
}

abstract class BaseDryRunRuntime {
  private readonly credentialResolver = new MockCredentialResolver();
  private readonly registry = createDefaultRuntimeAdapterRegistry();

  protected constructor(private readonly type: ExecutionJobType) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    try {
      validateRuntimeRequest(request);
      if (!context) return runtimeError(request.jobId, "validation_error", "runtime execution context is required");
      const credentialRef =
        context.credentialRef ?? credentialFromMetadata(context.metadata.credentialRef) ?? credentialFromMetadata(request.payload.credential_ref);
      if (context.policy.requireCredentialRef && !credentialRef)
        return runtimeError(request.jobId, "permission_denied", "runtime credential ref is required");

      const credential = credentialRef ? await this.credentialResolver.resolve(credentialRef) : null;
      const descriptor = this.registry.getAdapterDescriptor(this.type, "dry_run");
      validateRuntimeCredentialRef(credentialRef ?? { provider: "mock", keyRef: "secret://mock/optional", scope: "system" });
      return {
        jobId: request.jobId,
        status: "success",
        output: {
          dryRun: true,
          adapter: descriptor,
          credential,
          inputAccepted: true,
        },
        error: null,
        errorType: null,
        retryable: false,
        durationMs: 0,
        metadata: {
          mode: "dry_run",
          safetyMode: context.mode,
          networkAllowed: false,
          processSpawnAllowed: false,
        },
      };
    } catch (e) {
      return runtimeError(request.jobId, "validation_error", e instanceof Error ? e.message : String(e));
    }
  }
}

export class AgentDryRunRuntime extends BaseDryRunRuntime implements IAgentRuntime {
  constructor() {
    super("agent");
  }
}

export class MCPDryRunRuntime extends BaseDryRunRuntime implements IMCPRuntime {
  constructor() {
    super("mcp");
  }
}

export class PublisherDryRunRuntime extends BaseDryRunRuntime implements IPublisherRuntime {
  constructor() {
    super("publisher");
  }
}
