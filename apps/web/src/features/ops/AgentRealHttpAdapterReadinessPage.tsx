import type { AgentRealHttpAdapterReadinessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useAgentRealHttpAdapterReadiness } from "./hooks.js";

type Readiness = AgentRealHttpAdapterReadinessResponse;
type FactValue = string | number | string[];

const ENDPOINT = "/api/execution/ops/agent-real-http-adapter";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function clientLabel(readiness: Readiness) {
  return `${readiness.real_http_client_kind} HTTP client`;
}

function transportLabel(readiness: Readiness) {
  return readiness.real_transport_registered ? "transport registered" : "transport not registered";
}

function workerLabel(readiness: Readiness) {
  return readiness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked";
}

function runtimeLabel(value: boolean) {
  return value ? "allow real runtime" : "real runtime blocked";
}

function networkLabel(value: boolean) {
  return value ? "network allowed" : "network blocked";
}

function secretLabel(readiness: Readiness) {
  return readiness.secret_material_injected
    ? "secret material injected"
    : "secret material not injected";
}

function secretDetailLabel(readiness: Readiness) {
  return readiness.secret_material_injected ? "injected" : "not injected";
}

function timeoutAbortLabel(readiness: Readiness) {
  return readiness.real_http_timeout_abort_harness_ready
    ? "timeout abort harness ready"
    : "timeout abort harness blocked";
}

function transportSignalLabel(readiness: Readiness) {
  return readiness.transport_signal_forwarded
    ? "transport signal forwarded"
    : "transport signal blocked";
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts real-http-adapter-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {Array.isArray(row.value) ? (
              <span className="real-http-adapter-list">
                {row.value.map((item) => (
                  <span key={item} className="badge neutral">{item}</span>
                ))}
              </span>
            ) : (
              String(row.value)
            )}
          </dd>
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
    <section className="card ops-drilldown-card real-http-adapter-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ readiness }: { readiness: Readiness }) {
  return (
    <div className="kpi-grid ops-kpi-grid real-http-adapter-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(readiness.real_http_client_kind === "skeleton")}`}>
          {clientLabel(readiness)}
        </div>
        <div className="kpi-label">HTTP client</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(readiness.real_transport_registered)}`}>
          {transportLabel(readiness)}
        </div>
        <div className="kpi-label">Transport</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(!readiness.real_adapter_worker_enabled)}`}>
          {workerLabel(readiness)}
        </div>
        <div className="kpi-label">Worker</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(!readiness.secret_material_injected)}`}>
          {secretLabel(readiness)}
        </div>
        <div className="kpi-label">Secret boundary</div>
      </div>
    </div>
  );
}

function GateGrid({ readiness }: { readiness: Readiness }) {
  return (
    <div className="ops-drilldown-grid real-http-adapter-grid">
      <GateCard
        title="Real HTTP skeleton"
        status={readiness.real_http_client_kind === "skeleton" && !readiness.real_transport_registered}
        rows={[
          { label: "client", value: readiness.real_http_client_kind },
          { label: "transport", value: readiness.real_transport_registered ? "registered" : "not registered" },
          { label: "worker", value: readiness.real_adapter_worker_enabled ? "enabled" : "blocked" },
          { label: "reason", value: readiness.blocked_real_adapter_reason },
        ]}
      />
      <GateCard
        title="Runtime gates"
        status={readiness.allow_real_runtime && readiness.allow_network}
        rows={[
          { label: "runtime", value: readiness.runtime_mode },
          { label: "adapter", value: readiness.active_adapter_mode },
          { label: "runtime gate", value: runtimeLabel(readiness.allow_real_runtime) },
          { label: "network", value: networkLabel(readiness.allow_network) },
          {
            label: "allowlist",
            value: readiness.network_allowlist.length > 0 ? readiness.network_allowlist : ["none"],
          },
        ]}
      />
      <GateCard
        title="Harness"
        status={readiness.real_http_timeout_abort_harness_ready && readiness.transport_signal_forwarded}
        rows={[
          { label: "timeout abort", value: timeoutAbortLabel(readiness) },
          { label: "transport signal", value: transportSignalLabel(readiness) },
          { label: "timeout error", value: readiness.timeout_error_type },
          { label: "abort error", value: readiness.abort_error_type },
        ]}
      />
      <GateCard
        title="Secret boundary"
        status={!readiness.secret_material_injected}
        rows={[
          { label: "secret injection", value: secretDetailLabel(readiness) },
          { label: "mode", value: readiness.mode },
        ]}
      />
    </div>
  );
}

export function AgentRealHttpAdapterReadinessPage() {
  const { data, isLoading, isError, error } = useAgentRealHttpAdapterReadiness();

  return (
    <div className="agent-real-http-adapter">
      <div className="page-head">
        <div>
          <h1>Agent Real HTTP 适配器</h1>
          <p>只读 agent real HTTP adapter readiness，不注册真实 transport、不执行网络请求</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Agent Real HTTP 适配器加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <section className="card real-http-adapter-mode-card">
            <div className="ops-card-head">
              <h2>Adapter source</h2>
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
