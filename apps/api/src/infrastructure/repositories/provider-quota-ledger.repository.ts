import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { executionProviderQuotaLedger, type ExecutionProviderQuotaLedgerRow } from "../db/schema.js";

export interface ProviderQuotaLedgerScope {
  provider: string;
  keyRef: string;
  windowKey: string;
}

export async function getProviderQuotaLedgerRow(
  db: Db,
  scope: ProviderQuotaLedgerScope,
): Promise<ExecutionProviderQuotaLedgerRow | null> {
  const [row] = await db
    .select()
    .from(executionProviderQuotaLedger)
    .where(and(
      eq(executionProviderQuotaLedger.provider, scope.provider),
      eq(executionProviderQuotaLedger.keyRef, scope.keyRef),
      eq(executionProviderQuotaLedger.windowKey, scope.windowKey),
    ))
    .limit(1);
  return row ?? null;
}

export async function lockProviderQuotaLedgerRow(
  db: Db,
  scope: ProviderQuotaLedgerScope,
): Promise<ExecutionProviderQuotaLedgerRow> {
  await db
    .insert(executionProviderQuotaLedger)
    .values({
      provider: scope.provider,
      keyRef: scope.keyRef,
      windowKey: scope.windowKey,
      usedRequests: 0,
      usedCostCents: 0,
    })
    .onConflictDoNothing({
      target: [
        executionProviderQuotaLedger.provider,
        executionProviderQuotaLedger.keyRef,
        executionProviderQuotaLedger.windowKey,
      ],
    });
  const [row] = await db
    .select()
    .from(executionProviderQuotaLedger)
    .where(and(
      eq(executionProviderQuotaLedger.provider, scope.provider),
      eq(executionProviderQuotaLedger.keyRef, scope.keyRef),
      eq(executionProviderQuotaLedger.windowKey, scope.windowKey),
    ))
    .limit(1)
    .for("update");
  return row!;
}

export async function updateProviderQuotaLedgerUsage(
  db: Db,
  id: string,
  patch: { usedRequests: number; usedCostCents: number },
): Promise<ExecutionProviderQuotaLedgerRow> {
  const [row] = await db
    .update(executionProviderQuotaLedger)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(executionProviderQuotaLedger.id, id))
    .returning();
  return row!;
}

export async function hasProviderQuotaLedgerTable(db: Db): Promise<boolean> {
  try {
    const row = await getProviderQuotaLedgerRow(db, {
      provider: "__readiness__",
      keyRef: "env://READINESS_ONLY",
      windowKey: "1970-01-01",
    });
    return row === null;
  } catch (e) {
    const maybePgError = e as { code?: unknown; message?: unknown };
    if (maybePgError.code === "42P01" || String(maybePgError.message ?? "").includes("execution_provider_quota_ledger"))
      return false;
    throw e;
  }
}
