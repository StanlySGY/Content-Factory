import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import { isOutboxProcessed } from "../domain/execution/outbox.js";
import type { Db } from "../infrastructure/db/client.js";
import type { OutboxEventRow } from "../infrastructure/db/schema.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";

// OutboxHandler：事件投递处理器（Phase 1.6 仅结构）。handle 仅确认事件可识别，不触发真实副作用。
export interface OutboxHandler {
  eventType: string;
  eventTypes?: string[];
  handle(event: OutboxEventRow): Promise<void>;
}

const noopHandler = (eventType: string): OutboxHandler => ({
  eventType,
  handle: async () => {
    /* Phase 1.6：no-op 确认；Phase 2 由真实投递替换 */
  },
});

/** 默认注册：6 类 execution 事件各一个 no-op handler（唯一真相源 EXECUTION_OUTBOX_EVENTS）*/
export const defaultOutboxHandlers = (): OutboxHandler[] =>
  Object.values(EXECUTION_OUTBOX_EVENTS).map(noopHandler);

// OutboxRelay：纯 DB 轮询的出箱中继骨架（无 Redis/MQ、无网络、无真实执行）。
// 仅处理 outbox_events 自身生命周期：claim → dispatch(handler) → markProcessed / markFailed。
// 绝不修改 execution_jobs 或任何业务表。默认关闭（feature flag），可手动 process（API）或定时 start。
export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private readonly handlers: Map<string, OutboxHandler>;

  constructor(
    private readonly db: Db,
    handlers: OutboxHandler[] = defaultOutboxHandlers(),
    private readonly intervalMs = 5000,
    private readonly owner = "outbox-relay",
    private readonly leaseMs = 30000,
  ) {
    this.handlers = new Map(
      handlers.flatMap((h) => (h.eventTypes ?? [h.eventType]).map((eventType) => [eventType, h])),
    );
  }

  /** 领取并投递下一个未处理事件（轮询入口）。无可领取返回 null。*/
  async tick(): Promise<OutboxEventRow | null> {
    const event = await outboxRepo.claimNextOutboxEvent(this.db, { owner: this.owner, leaseMs: this.leaseMs });
    return event ? this.dispatch(event) : null;
  }

  /** 批量处理至多 limit 条未处理事件（运维手动触发）；返回已投递的事件行（含 markProcessed/markFailed 结果）。*/
  async processBatch(limit: number): Promise<OutboxEventRow[]> {
    const out: OutboxEventRow[] = [];
    for (let i = 0; i < limit; i++) {
      const event = await this.tick();
      if (!event) break;
      out.push(event);
    }
    return out;
  }

  /** 手动处理指定事件：不存在 → 404；已处理 → 409；否则投递并返回结果行。*/
  async processEvent(id: string): Promise<OutboxEventRow> {
    const existing = await outboxRepo.getOutboxEvent(this.db, id);
    if (!existing) throw new NotFoundError(`outbox_event ${id} not found`);
    if (isOutboxProcessed(existing)) throw new ConflictError(`outbox_event ${id} already processed`);
    return this.dispatch(existing);
  }

  // 分发：无 handler → markFailed('no handler registered')；handler 成功 → markProcessed；抛错 → markFailed(error)。
  private async dispatch(event: OutboxEventRow): Promise<OutboxEventRow> {
    const handler = this.handlers.get(event.eventType);
    if (!handler) return (await outboxRepo.markFailed(this.db, event.id, "no handler registered"))!;
    try {
      await handler.handle(event);
      return (await outboxRepo.markProcessed(this.db, event.id))!;
    } catch (e) {
      return (await outboxRepo.markFailed(this.db, event.id, (e as Error).message))!;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined); // infra 抖动下周期重试；事件失败已落 outbox.error
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
