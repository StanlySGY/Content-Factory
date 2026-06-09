import { ValidationError } from "../../domain/errors.js";

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
  distributed: false;
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
  checkAndConsume(): ProviderQuotaDecision;
  snapshot(): ProviderQuotaDecision;
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

  checkAndConsume(): ProviderQuotaDecision {
    this.resetIfNeeded();
    const blocked = this.blockingReason();
    if (blocked) return this.decision("throttle", blocked);
    this.usedRequests += 1;
    this.usedCostCents += this.limits.estimatedCostPerRequestCents;
    return this.decision("allow", null);
  }

  snapshot(): ProviderQuotaDecision {
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
