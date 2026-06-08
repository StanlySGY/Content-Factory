import { ValidationError } from "../../domain/errors.js";
import {
  failedRuntimeResponse,
  isRetryableRuntimeError,
  validateRuntimeRequest,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../../domain/execution/runtime-contract.js";
import {
  assertRealExecutionAllowed,
  redactRuntimeSnapshot,
  type RuntimeExecutionContext,
} from "../../domain/execution/runtime-safety.js";
import {
  buildPublisherRequestId,
  buildRollbackPlanSnapshot,
  validatePublisherRuntimePayload,
  type PublisherRollbackPlanSnapshot,
  type PublisherRuntimePayload,
} from "../../domain/execution/publisher-runtime.js";
import type { IPublisherRuntime } from "./ports.js";

export interface PublisherHarnessRequest {
  jobId: string;
  attemptCount: number;
  idempotencyKey: string;
  action: PublisherRuntimePayload["action"];
  targetRef: string;
  channel: string;
  content: Record<string, unknown>;
  preview: PublisherRuntimePayload["preview"];
  approvalRef: string | null;
  publisherRequestId: string | null;
  rollbackPlan: PublisherRollbackPlanSnapshot | null;
}

export interface PublisherHarnessResult {
  previewId?: string;
  checksum?: string;
  fakePublished?: boolean;
}

export interface IPublisherLocalHarness {
  readonly kind: "fake_local";
  invoke(request: PublisherHarnessRequest, signal: AbortSignal): Promise<PublisherHarnessResult>;
}

function baseMetadata(context: RuntimeExecutionContext | undefined, harnessKind: string | null): Record<string, unknown> {
  return {
    adapterMode: "publisher_safety",
    runtimeMode: context?.mode ?? null,
    publisherHarness: harnessKind,
    networkUsed: false,
    processSpawned: false,
    secret_material_read: false,
    secret_material_returned: false,
  };
}

function failed(
  request: RuntimeRequest,
  errorType: NonNullable<RuntimeResponse["errorType"]>,
  error: string,
  metadata: Record<string, unknown>,
  output: Record<string, unknown> = {},
): RuntimeResponse {
  return {
    ...failedRuntimeResponse(request.jobId, errorType, error),
    output,
    retryable: isRetryableRuntimeError(errorType),
    metadata,
  };
}

export class FakeLocalPublisherHarness implements IPublisherLocalHarness {
  readonly kind = "fake_local" as const;

  async invoke(request: PublisherHarnessRequest, signal: AbortSignal): Promise<PublisherHarnessResult> {
    if (signal.aborted) throw Object.assign(new Error("publisher invocation aborted"), { name: "AbortError" });
    if (request.action === "preview") {
      return {
        previewId: `preview-${request.jobId}-${request.attemptCount}`,
        checksum: `sha256:${request.idempotencyKey}`,
      };
    }
    return { fakePublished: request.action === "publish" };
  }
}

export class PublisherSafetyRuntime implements IPublisherRuntime {
  constructor(private readonly harness: IPublisherLocalHarness | null = null) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    const metadata = baseMetadata(context, this.harness?.kind ?? null);
    try {
      validateRuntimeRequest(request);
      if (!context) throw new ValidationError("runtime execution context is required");
      if (request.jobType !== "publisher") throw new ValidationError("publisher safety runtime only supports publisher jobs");
      assertRealExecutionAllowed(context.policy);
      if (context.policy.allowNetwork)
        return failed(request, "permission_denied", "publisher safety runtime does not allow network", metadata);
      if (!context.credentialRef)
        return failed(request, "permission_denied", "runtime credential ref is required", metadata);
      if (!this.harness)
        return failed(request, "permission_denied", "publisher local harness is not registered", metadata);

      const payload = validatePublisherRuntimePayload(request.payload);
      const commonMetadata = {
        ...metadata,
        approvalRequired: payload.action === "publish",
        approvalPresent: payload.approved,
        credentialRefPresent: true,
        credentialProvider: context.credentialRef.provider,
        credentialScope: context.credentialRef.scope,
      };

      if (payload.action === "preview") return this.preview(request, context, payload, commonMetadata);
      if (payload.action === "rollback_plan") return this.rollbackPlan(request, context, payload, commonMetadata);
      if (!payload.preview) {
        return failed(request, "blocked", "publisher preview is required before publish", commonMetadata, {
          blocked: true,
          reason: "preview_required",
        });
      }
      if (!payload.approved || !payload.approvalRef) {
        return failed(request, "blocked", "publisher approval is required before publish", commonMetadata, {
          blocked: true,
          reason: "approval_required",
        });
      }
      return this.publish(request, context, payload, commonMetadata);
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || /aborted|timeout/i.test(e.message));
      if (aborted)
        return failed(request, "timeout", e instanceof Error ? e.message : String(e), {
          ...metadata,
          cancelled: context?.abortSignal.aborted === true,
        });
      const errorType = e instanceof ValidationError ? "validation_error" : "unknown";
      return failed(request, errorType, e instanceof Error ? e.message : String(e), {
        ...metadata,
        durationMs: Math.max(0, Date.now() - started),
      });
    }
  }

  private async preview(
    request: RuntimeRequest,
    context: RuntimeExecutionContext,
    payload: PublisherRuntimePayload,
    metadata: Record<string, unknown>,
  ): Promise<RuntimeResponse> {
    const result = await this.harness!.invoke({
      jobId: request.jobId,
      attemptCount: request.attemptCount,
      idempotencyKey: request.idempotencyKey,
      action: payload.action,
      targetRef: payload.targetRef,
      channel: payload.channel,
      content: redactRuntimeSnapshot(payload.content),
      preview: null,
      approvalRef: null,
      publisherRequestId: null,
      rollbackPlan: null,
    }, context.abortSignal);
    return {
      jobId: request.jobId,
      status: "success",
      output: {
        provider: "publisher",
        action: "preview",
        externalPublished: false,
        preview: {
          previewId: result.previewId,
          checksum: result.checksum,
        },
      },
      error: null,
      errorType: null,
      retryable: false,
      durationMs: 0,
      metadata,
    };
  }

  private async publish(
    request: RuntimeRequest,
    context: RuntimeExecutionContext,
    payload: PublisherRuntimePayload,
    metadata: Record<string, unknown>,
  ): Promise<RuntimeResponse> {
    const publisherRequestId = buildPublisherRequestId({
      targetRef: payload.targetRef,
      channel: payload.channel,
      previewId: payload.preview!.previewId,
      idempotencyKey: request.idempotencyKey,
    });
    const rollbackPlan = buildRollbackPlanSnapshot({
      targetRef: payload.targetRef,
      channel: payload.channel,
      publisherRequestId,
    });
    const result = await this.harness!.invoke({
      jobId: request.jobId,
      attemptCount: request.attemptCount,
      idempotencyKey: request.idempotencyKey,
      action: payload.action,
      targetRef: payload.targetRef,
      channel: payload.channel,
      content: redactRuntimeSnapshot(payload.content),
      preview: payload.preview,
      approvalRef: payload.approvalRef,
      publisherRequestId,
      rollbackPlan,
    }, context.abortSignal);
    return {
      jobId: request.jobId,
      status: "success",
      output: {
        provider: "publisher",
        action: "publish",
        externalPublished: false,
        fakePublished: result.fakePublished === true,
        publisherRequestId,
        preview: payload.preview,
        rollbackPlan,
      },
      error: null,
      errorType: null,
      retryable: false,
      durationMs: 0,
      metadata,
    };
  }

  private async rollbackPlan(
    request: RuntimeRequest,
    context: RuntimeExecutionContext,
    payload: PublisherRuntimePayload,
    metadata: Record<string, unknown>,
  ): Promise<RuntimeResponse> {
    const publisherRequestId =
      typeof request.payload.publisherRequestId === "string" && request.payload.publisherRequestId.trim().length > 0
        ? request.payload.publisherRequestId
        : buildPublisherRequestId({
            targetRef: payload.targetRef,
            channel: payload.channel,
            previewId: payload.preview?.previewId ?? "no-preview",
            idempotencyKey: request.idempotencyKey,
          });
    const rollbackPlan = buildRollbackPlanSnapshot({ targetRef: payload.targetRef, channel: payload.channel, publisherRequestId });
    await this.harness!.invoke({
      jobId: request.jobId,
      attemptCount: request.attemptCount,
      idempotencyKey: request.idempotencyKey,
      action: payload.action,
      targetRef: payload.targetRef,
      channel: payload.channel,
      content: redactRuntimeSnapshot(payload.content),
      preview: payload.preview,
      approvalRef: payload.approvalRef,
      publisherRequestId,
      rollbackPlan,
    }, context.abortSignal);
    return {
      jobId: request.jobId,
      status: "success",
      output: {
        provider: "publisher",
        action: "rollback_plan",
        externalPublished: false,
        rollbackPlan,
      },
      error: null,
      errorType: null,
      retryable: false,
      durationMs: 0,
      metadata,
    };
  }
}
