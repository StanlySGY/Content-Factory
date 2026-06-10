import type { AgentRealProviderConfigPreflightResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useAgentRealProviderConfigPreflight } from "./hooks.js";

type Readiness = AgentRealProviderConfigPreflightResponse;
type FactValue = string | number;
type JsonRecord = Record<string, unknown>;

const ENDPOINT = "/api/execution/ops/agent-real-provider-config-preflight";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function endpointLabel(readiness: Readiness) {
  return readiness.endpoint_resolved ? "endpoint resolved" : "endpoint unresolved";
}

function networkLabel(readiness: Readiness) {
  return readiness.endpoint_network_checked ? "network checked" : "network not checked";
}

function secretReadLabel(readiness: Readiness) {
  return readiness.secret_material_read ? "secret material read" : "secret material not read";
}

function secretReturnLabel(readiness: Readiness) {
  return readiness.secret_material_returned ? "secret material returned" : "secret material not returned";
}

function billingLabel(enabled: boolean) {
  return enabled ? "billing enabled" : "billing disabled";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized;
}

function credentialFacts(readiness: Readiness) {
  const credential = asRecord(asRecord(readiness.redacted_config).credential_ref);
  return [
    { label: "provider", value: text(credential.provider) },
    { label: "key ref", value: text(credential.key_ref ?? credential.keyRef) },
    { label: "scope", value: text(credential.scope) },
  ];
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts provider-config-detail-facts">
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
  rows: { label: string; value: FactValue }[];
}) {
  return (
    <section className="card ops-drilldown-card provider-config-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ readiness }: { readiness: Readiness }) {
  const secretSafe = !readiness.secret_material_read && !readiness.secret_material_returned;
  const workerSafe = !readiness.real_adapter_worker_enabled;

  return (
    <div className="kpi-grid ops-kpi-grid provider-config-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(readiness.config_ready)}`}>
          {readyLabel(readiness.config_ready)}
        </div>
        <div className="kpi-label">Config</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(readiness.credential_ref_ready)}`}>
          {readiness.credential_ref_ready ? "credential ref ready" : "missing credential ref"}
        </div>
        <div className="kpi-label">Credential</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(secretSafe)}`}>
          {secretSafe ? "secret material safe" : "secret material exposed"}
        </div>
        <div className="kpi-label">Secret boundary</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(workerSafe)}`}>
          {readiness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked"}
        </div>
        <div className="kpi-label">Real adapter</div>
      </div>
    </div>
  );
}

function GateGrid({ readiness }: { readiness: Readiness }) {
  return (
    <div className="ops-drilldown-grid provider-config-grid">
      <GateCard
        title="Provider config"
        status={readiness.config_ready}
        rows={[
          { label: "provider", value: readiness.provider_kind },
          { label: "model", value: readiness.model },
          { label: "adapter", value: readiness.active_adapter_mode },
          { label: "runtime", value: readiness.runtime_mode },
        ]}
      />
      <GateCard
        title="Endpoint"
        status={readiness.endpoint_resolved && !readiness.endpoint_network_checked}
        rows={[
          { label: "ref", value: readiness.endpoint_ref },
          { label: "resolved", value: endpointLabel(readiness) },
          { label: "network", value: networkLabel(readiness) },
          { label: "allow network", value: yesNo(readiness.allow_network) },
        ]}
      />
      <GateCard
        title="Credential boundary"
        status={readiness.credential_ref_ready && !readiness.secret_material_returned}
        rows={[
          { label: "credential", value: readiness.credential_ref_ready ? "credential ref ready" : "missing" },
          { label: "secret read", value: secretReadLabel(readiness) },
          { label: "secret returned", value: secretReturnLabel(readiness) },
          ...credentialFacts(readiness),
        ]}
      />
      <GateCard
        title="Policy profiles"
        status={readiness.timeout_within_policy && readiness.quota_profile_ready && readiness.cost_profile_ready}
        rows={[
          { label: "timeout", value: `${readiness.timeout_ms}ms` },
          {
            label: "timeout policy",
            value: readiness.timeout_within_policy ? "timeout within policy" : "timeout outside policy",
          },
          {
            label: "quota",
            value: readiness.quota_profile_ready ? "quota profile ready" : "quota profile missing",
          },
          {
            label: "distributed quota",
            value: readiness.distributed_quota_ready ? "distributed quota ready" : "distributed quota blocked",
          },
          {
            label: "cost",
            value: readiness.cost_profile_ready ? "cost profile ready" : "cost profile missing",
          },
          { label: "cost source", value: readiness.cost_source },
        ]}
      />
      <GateCard
        title="Runtime gate"
        status={!readiness.real_adapter_worker_enabled}
        rows={[
          { label: "billing", value: billingLabel(readiness.real_provider_billing_enabled) },
          { label: "worker", value: readiness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked" },
          { label: "reason", value: readiness.blocked_real_adapter_reason },
        ]}
      />
    </div>
  );
}

export function AgentProviderConfigPreflightPage() {
  const { data, isLoading, isError, error } = useAgentRealProviderConfigPreflight();

  return (
    <div className="agent-provider-config-preflight">
      <div className="page-head">
        <div>
          <h1>Provider 配置门禁</h1>
          <p>只读 agent real provider config preflight，不读取 secret、不执行 provider 请求</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Provider 配置门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <section className="card provider-config-mode-card">
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
