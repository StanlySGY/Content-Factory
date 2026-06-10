import type { ProviderQuotaCostPreflightReadinessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useProviderQuotaCostPreflight } from "./hooks.js";

type Readiness = ProviderQuotaCostPreflightReadinessResponse;

const ENDPOINT = "/api/execution/ops/provider-quota-cost-preflight";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function billingLabel(enabled: boolean) {
  return enabled ? "billing enabled" : "billing disabled";
}

function costValue(readiness: Readiness) {
  if (readiness.cost_amount === null || readiness.cost_currency === null) return "not calculated";
  return `${readiness.cost_amount} ${readiness.cost_currency}`;
}

function DetailFacts({ rows }: { rows: { label: string; value: string | number }[] }) {
  return (
    <dl className="ops-detail-facts quota-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{String(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function GateCard({
  title,
  status,
  rows,
}: {
  title: string;
  status: boolean;
  rows: { label: string; value: string | number }[];
}) {
  return (
    <section className="card ops-drilldown-card quota-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ readiness }: { readiness: Readiness }) {
  const safeRuntime =
    !readiness.real_adapter_worker_enabled && !readiness.real_provider_billing_enabled;

  return (
    <div className="kpi-grid ops-kpi-grid quota-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(readiness.quota_policy_ready)}`}>
          {readyLabel(readiness.quota_policy_ready)}
        </div>
        <div className="kpi-label">Quota policy</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(readiness.cost_metrics_ready)}`}>
          {readyLabel(readiness.cost_metrics_ready)}
        </div>
        <div className="kpi-label">Cost metrics</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(safeRuntime)}`}>
          {readiness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked"}
        </div>
        <div className="kpi-label">Real adapter</div>
      </div>
      <div className="card kpi">
        <div className="badge success">未执行 provider 请求</div>
        <div className="kpi-label">External side effect</div>
      </div>
    </div>
  );
}

function GateGrid({ readiness }: { readiness: Readiness }) {
  return (
    <div className="ops-drilldown-grid quota-grid">
      <GateCard
        title="Quota policy"
        status={readiness.quota_policy_ready}
        rows={[
          { label: "window", value: `${readiness.default_window_ms}ms` },
          { label: "limit", value: `${readiness.default_max_requests_per_window} requests/window` },
          { label: "allow", value: readiness.quota_decision_allow_status },
          { label: "throttle", value: readiness.quota_decision_throttle_status },
          { label: "rate limit error", value: readiness.rate_limit_error_type },
        ]}
      />
      <GateCard
        title="Distributed quota"
        status={readiness.distributed_quota_ready}
        rows={[
          { label: "distributed", value: yesNo(readiness.distributed_quota_ready) },
          { label: "active adapter", value: readiness.active_adapter_mode },
          { label: "runtime mode", value: readiness.runtime_mode },
        ]}
      />
      <GateCard
        title="Cost metrics"
        status={readiness.cost_metrics_ready}
        rows={[
          { label: "source", value: readiness.cost_source },
          { label: "token usage", value: readiness.token_usage_ready ? "token usage ready" : "missing" },
          { label: "amount", value: costValue(readiness) },
          { label: "billing", value: billingLabel(readiness.real_provider_billing_enabled) },
        ]}
      />
      <GateCard
        title="Runtime gate"
        status={!readiness.real_adapter_worker_enabled}
        rows={[
          { label: "worker", value: readiness.real_adapter_worker_enabled ? "enabled" : "blocked" },
          { label: "reason", value: readiness.blocked_real_adapter_reason },
          { label: "allow runtime", value: yesNo(readiness.allow_real_runtime) },
          { label: "allow network", value: yesNo(readiness.allow_network) },
        ]}
      />
    </div>
  );
}

export function ProviderQuotaCostPreflightPage() {
  const { data, isLoading, isError, error } = useProviderQuotaCostPreflight();

  return (
    <div className="provider-quota-preflight">
      <div className="page-head">
        <div>
          <h1>额度成本门禁</h1>
          <p>只读 provider quota/cost preflight，不执行真实 provider 请求</p>
        </div>
      </div>

      {isError && <ErrorBar message={`额度成本门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <section className="card quota-mode-card">
            <div className="ops-card-head">
              <h2>Preflight source</h2>
              <span className="badge info">{data.mode}</span>
            </div>
            <code className="ops-endpoint">{ENDPOINT}</code>
          </section>

          <GateGrid readiness={data} />
        </>
      )}
    </div>
  );
}
