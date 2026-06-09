import { ValidationError } from "../../domain/errors.js";
import type { RuntimeCredentialRef } from "../../domain/execution/runtime-safety.js";
import type { Db } from "../../infrastructure/db/client.js";
import * as quotaRepo from "../../infrastructure/repositories/provider-quota-ledger.repository.js";

export type ProviderQuotaThrottleReason =
  "daily_request_limit_exceeded" |
  "daily_cost_limit_exceeded";

export interface ProviderQuotaLimits {
  dailyRequestLimit: number | null;
  dailyCostLimitCents: number | null;
  estimatedCostPerRequestCents: number;
}

export interface ProviderQuotaDecision {
  status: "allow" | "throttle";
  reason: ProviderQuotaThrottleReason | null;
  distributed: boolean;
  dailyRequestLimit: number | null;
  dailyCostLimitCents: number | null;
  estimatedCostPerRequestCents: number;
  usedRequests: number;
  usedCostCents: number;
  costEstimate: {
    source: "configured_estimate";
    amountCents: number;
    currency: "USD";
  };
}

export interface ProviderQuotaEnforcer {
  checkAndConsume(ref?: RuntimeCredentialRef | null): Promise<ProviderQuotaDecision>;
  snapshot(ref?: RuntimeCredentialRef | null): Promise<ProviderQuotaDecision>;
}

function assertNonNegativeInteger(value: number, message: string): void {
  if (!Number.isInteger(value) || value < 0) throw new ValidationError(message);
}

export function validateProviderQuotaLimits(limits: ProviderQuotaLimits): void {
  if (limits.dailyRequestLimit !== null)
    assertNonNegativeInteger(limits.dailyRequestLimit, "dailyRequestLimit must be a non-negative integer");
  if (limits.dailyCostLimitCents !== null)
    assertNonNegativeInteger(limits.dailyCostLimitCents, "dailyCostLimitCents must be a non-negative integer");
  assertNonNegativeInteger(
    limits.estimatedCostPerRequestCents,
    "estimatedCostPerRequestCents must be a non-negative integer",
  );
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class InMemoryProviderQuotaEnforcer implements ProviderQuotaEnforcer {
  private currentDay = dayKey(new Date());
  private usedRequests = 0;
  private usedCostCents = 0;

  constructor(
    private readonly limits: ProviderQuotaLimits,
    private readonly now: () => Date = () => new Date(),
  ) {
    validateProviderQuotaLimits(limits);
  }

  async checkAndConsume(): Promise<ProviderQuotaDecision> {
    this.resetIfNeeded();
    const blocked = this.blockingReason();
    if (blocked) return this.decision("throttle", blocked);
    this.usedRequests += 1;
    this.usedCostCents += this.limits.estimatedCostPerRequestCents;
    return this.decision("allow", null);
  }

  async snapshot(): Promise<ProviderQuotaDecision> {
    this.resetIfNeeded();
    return this.decision("allow", null);
  }

  private resetIfNeeded(): void {
    const today = dayKey(this.now());
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.usedRequests = 0;
      this.usedCostCents = 0;
    }
  }

  private blockingReason(): ProviderQuotaThrottleReason | null {
    if (this.limits.dailyRequestLimit !== null && this.usedRequests >= this.limits.dailyRequestLimit)
      return "daily_request_limit_exceeded";
    if (
      this.limits.dailyCostLimitCents !== null &&
      this.usedCostCents + this.limits.estimatedCostPerRequestCents > this.limits.dailyCostLimitCents
    )
      return "daily_cost_limit_exceeded";
    return null;
  }

  private decision(status: ProviderQuotaDecision["status"], reason: ProviderQuotaThrottleReason | null): ProviderQuotaDecision {
    return {
      status,
      reason,
      distributed: false,
      dailyRequestLimit: this.limits.dailyRequestLimit,
      dailyCostLimitCents: this.limits.dailyCostLimitCents,
      estimatedCostPerRequestCents: this.limits.estimatedCostPerRequestCents,
      usedRequests: this.usedRequests,
      usedCostCents: this.usedCostCents,
      costEstimate: {
        source: "configured_estimate",
        amountCents: this.limits.estimatedCostPerRequestCents,
        currency: "USD",
      },
    };
  }
}

export class DbProviderQuotaEnforcer implements ProviderQuotaEnforcer {
  constructor(
    private readonly db: Db,
    private readonly limits: ProviderQuotaLimits,
    private readonly now: () => Date = () => new Date(),
  ) {
    validateProviderQuotaLimits(limits);
  }

  async checkAndConsume(ref?: RuntimeCredentialRef | null): Promise<ProviderQuotaDecision> {
    const scope = this.scope(ref);
    return this.db.transaction(async (tx) => {
      const row = await quotaRepo.lockProviderQuotaLedgerRow(tx, scope);
      const blocked = this.blockingReason(row.usedRequests, row.usedCostCents);
      if (blocked) return this.decision("throttle", blocked, row.usedRequests, row.usedCostCents);
      const updated = await quotaRepo.updateProviderQuotaLedgerUsage(tx, row.id, {
        usedRequests: row.usedRequests + 1,
        usedCostCents: row.usedCostCents + this.limits.estimatedCostPerRequestCents,
      });
      return this.decision("allow", null, updated.usedRequests, updated.usedCostCents);
    });
  }

  async snapshot(ref?: RuntimeCredentialRef | null): Promise<ProviderQuotaDecision> {
    const row = await quotaRepo.getProviderQuotaLedgerRow(this.db, this.scope(ref));
    return this.decision("allow", null, row?.usedRequests ?? 0, row?.usedCostCents ?? 0);
  }

  private scope(ref?: RuntimeCredentialRef | null): quotaRepo.ProviderQuotaLedgerScope {
    return {
      provider: ref?.provider ?? "openai_compatible",
      keyRef: ref?.keyRef ?? "env://CONTENT_FACTORY_OPENAI_KEY",
      windowKey: dayKey(this.now()),
    };
  }

  private blockingReason(usedRequests: number, usedCostCents: number): ProviderQuotaThrottleReason | null {
    if (this.limits.dailyRequestLimit !== null && usedRequests >= this.limits.dailyRequestLimit)
      return "daily_request_limit_exceeded";
    if (
      this.limits.dailyCostLimitCents !== null &&
      usedCostCents + this.limits.estimatedCostPerRequestCents > this.limits.dailyCostLimitCents
    )
      return "daily_cost_limit_exceeded";
    return null;
  }

  private decision(
    status: ProviderQuotaDecision["status"],
    reason: ProviderQuotaThrottleReason | null,
    usedRequests: number,
    usedCostCents: number,
  ): ProviderQuotaDecision {
    return {
      status,
      reason,
      distributed: true,
      dailyRequestLimit: this.limits.dailyRequestLimit,
      dailyCostLimitCents: this.limits.dailyCostLimitCents,
      estimatedCostPerRequestCents: this.limits.estimatedCostPerRequestCents,
      usedRequests,
      usedCostCents,
      costEstimate: {
        source: "configured_estimate",
        amountCents: this.limits.estimatedCostPerRequestCents,
        currency: "USD",
      },
    };
  }
}
