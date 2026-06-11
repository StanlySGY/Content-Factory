import { eq, and } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { executionCostSettlements, type ExecutionCostSettlementRow } from "../db/schema.js";

export interface ExecutionCostSettlementWrite {
  executionResultId: string;
  executionJobId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptMicroCentsPerToken: number;
  completionMicroCentsPerToken: number;
  amountMicroCents: number;
  amountCents: number;
  currency: string;
  rateCardVersion: string;
  settlementSource: string;
}

export async function createSettlementIfAbsent(
  db: Db,
  input: ExecutionCostSettlementWrite,
): Promise<ExecutionCostSettlementRow | null> {
  const [row] = await db
    .insert(executionCostSettlements)
    .values(input)
    .onConflictDoNothing({
      target: [
        executionCostSettlements.executionResultId,
        executionCostSettlements.rateCardVersion,
      ],
    })
    .returning();
  return row ?? null;
}

export async function getSettlementByResultAndRateCard(
  db: Db,
  input: { executionResultId: string; rateCardVersion: string },
): Promise<ExecutionCostSettlementRow | null> {
  const [row] = await db
    .select()
    .from(executionCostSettlements)
    .where(and(
      eq(executionCostSettlements.executionResultId, input.executionResultId),
      eq(executionCostSettlements.rateCardVersion, input.rateCardVersion),
    ))
    .limit(1);
  return row ?? null;
}
