import { ValidationError } from "../errors.js";

// Outbox 事件领域模型（execution layer 内部事件）。
// 边界：与 Sprint-4 audit_events 哈希链彻底分离——outbox 是「待投递的执行事件」，可重试、可标记处理；
// audit 是「不可篡改的审计链」。二者互不替代、互不消费。

export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  processedAt: Date | null;
  error: string | null;
  retryCount: number;
  claimedAt: Date | null;
  claimedOwner: string | null;
  claimExpiresAt: Date | null;
  createdAt: Date;
}

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

/** 结构校验：聚合标识/事件类型非空，payload 为非空对象（不校验 eventType 是否已注册——未注册由 relay markFailed）*/
export function validateOutboxEvent(input: OutboxEventInput): void {
  if (!input.aggregateType || input.aggregateType.trim().length === 0)
    throw new ValidationError("outbox event aggregateType is required");
  if (!input.aggregateId || input.aggregateId.trim().length === 0)
    throw new ValidationError("outbox event aggregateId is required");
  if (!input.eventType || input.eventType.trim().length === 0)
    throw new ValidationError("outbox event eventType is required");
  if (input.payload === null || typeof input.payload !== "object" || Array.isArray(input.payload))
    throw new ValidationError("outbox event payload must be a non-null object");
}

/** 已处理判定：processed_at 非空 */
export function isOutboxProcessed(event: Pick<OutboxEvent, "processedAt">): boolean {
  return event.processedAt !== null;
}

/** 处理成功补丁：置 processed_at（保留 error 以留存历史），清空 relay lease */
export function markOutboxProcessed(now: Date = new Date()): {
  processedAt: Date;
  claimedAt: null;
  claimedOwner: null;
  claimExpiresAt: null;
} {
  return { processedAt: now, claimedAt: null, claimedOwner: null, claimExpiresAt: null };
}

/** 处理失败补丁：retry_count+1、写 error、processed_at 保持 null（待下次 relay 重试） */
export function markOutboxFailed(
  event: Pick<OutboxEvent, "retryCount">,
  error: string,
): {
  retryCount: number;
  error: string;
  processedAt: null;
  claimedAt: null;
  claimedOwner: null;
  claimExpiresAt: null;
} {
  return {
    retryCount: event.retryCount + 1,
    error,
    processedAt: null,
    claimedAt: null,
    claimedOwner: null,
    claimExpiresAt: null,
  };
}
