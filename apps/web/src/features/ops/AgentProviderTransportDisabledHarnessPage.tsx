import type { AgentRealProviderTransportDisabledHarnessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useAgentRealProviderTransportDisabledHarness } from "./hooks.js";

type Harness = AgentRealProviderTransportDisabledHarnessResponse;
type FactValue = string | number;
type JsonRecord = Record<string, unknown>;

const ENDPOINT = "/api/execution/ops/agent-real-provider-transport-disabled-harness";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function requestShapeLabel(harness: Harness) {
  return harness.request_shape_ready ? "request shape ready" : "request shape blocked";
}

function disabledTransportLabel(harness: Harness) {
  return harness.disabled_transport_ready ? "disabled transport ready" : "disabled transport missing";
}

function transportLabel(harness: Harness) {
  return harness.transport_executable ? "transport executable" : "transport disabled";
}

function networkLabel(harness: Harness) {
  return harness.network_attempted ? "network attempted" : "network not attempted";
}

function endpointLabel(harness: Harness) {
  return harness.endpoint_resolved ? "endpoint resolved" : "endpoint unresolved";
}

function secretReadLabel(harness: Harness) {
  return harness.secret_material_read ? "secret material read" : "secret material not read";
}

function secretReturnLabel(harness: Harness) {
  return harness.secret_material_returned ? "secret material returned" : "secret material not returned";
}

function failClosedLabel(harness: Harness) {
  return harness.fail_closed ? "fail closed" : "not fail closed";
}

function retryableLabel(harness: Harness) {
  return harness.fail_closed_retryable ? "retryable" : "not retryable";
}

function workerLabel(harness: Harness) {
  return harness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized;
}

function redactedRequestFacts(harness: Harness) {
  const request = asRecord(harness.redacted_request);
  const headers = asRecord(request.headers_ref ?? request.headers);
  const body = asRecord(request.body);
  return [
    { label: "method", value: text(request.method) },
    { label: "url ref", value: text(request.url_ref ?? request.urlRef) },
    { label: "authorization", value: text(headers.Authorization ?? headers.authorization) },
    { label: "model", value: text(body.model) },
  ];
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts provider-transport-detail-facts">
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
    <section className="card ops-drilldown-card provider-transport-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ harness }: { harness: Harness }) {
  const transportBlocked = harness.disabled_transport_ready && !harness.transport_executable;
  const noExternalBoundary =
    !harness.network_attempted && !harness.secret_material_read && !harness.secret_material_returned;

  return (
    <div className="kpi-grid ops-kpi-grid provider-transport-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(harness.request_shape_ready)}`}>
          {requestShapeLabel(harness)}
        </div>
        <div className="kpi-label">Request</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(transportBlocked)}`}>
          {transportLabel(harness)}
        </div>
        <div className="kpi-label">Transport</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(noExternalBoundary)}`}>
          {noExternalBoundary ? "boundary safe" : "boundary breached"}
        </div>
        <div className="kpi-label">Network / Secret</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(harness.fail_closed)}`}>
          {failClosedLabel(harness)}
        </div>
        <div className="kpi-label">Fail closed</div>
      </div>
    </div>
  );
}

function GateGrid({ harness }: { harness: Harness }) {
  return (
    <div className="ops-drilldown-grid provider-transport-grid">
      <GateCard
        title="Request shape"
        status={harness.request_shape_ready}
        rows={[
          { label: "provider", value: harness.provider_kind },
          { label: "method", value: harness.request_method },
          { label: "url ref", value: harness.url_ref },
          { label: "timeout", value: `${harness.timeout_ms}ms` },
        ]}
      />
      <GateCard
        title="Disabled transport"
        status={harness.disabled_transport_ready && !harness.transport_executable}
        rows={[
          { label: "transport readiness", value: disabledTransportLabel(harness) },
          { label: "transport", value: transportLabel(harness) },
          { label: "worker", value: workerLabel(harness) },
        ]}
      />
      <GateCard
        title="External boundary"
        status={!harness.network_attempted && !harness.secret_material_returned}
        rows={[
          { label: "network", value: networkLabel(harness) },
          { label: "endpoint", value: endpointLabel(harness) },
          { label: "secret read", value: secretReadLabel(harness) },
          { label: "secret returned", value: secretReturnLabel(harness) },
        ]}
      />
      <GateCard
        title="Fail closed"
        status={harness.fail_closed}
        rows={[
          { label: "state", value: failClosedLabel(harness) },
          { label: "error type", value: harness.fail_closed_error_type },
          { label: "retry", value: retryableLabel(harness) },
        ]}
      />
      <GateCard
        title="Redacted request"
        status={!harness.secret_material_returned}
        rows={redactedRequestFacts(harness)}
      />
    </div>
  );
}

export function AgentProviderTransportDisabledHarnessPage() {
  const { data, isLoading, isError, error } = useAgentRealProviderTransportDisabledHarness();

  return (
    <div className="agent-provider-transport-disabled-harness">
      <div className="page-head">
        <div>
          <h1>Provider 传输门禁</h1>
          <p>只读 agent real provider transport disabled harness，不执行 transport、不读取 secret</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Provider 传输门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary harness={data} />

          <section className="card provider-transport-mode-card">
            <div className="ops-card-head">
              <h2>Harness source</h2>
              <span className="badge info">{data.mode}</span>
            </div>
            <code className="ops-endpoint">{ENDPOINT}</code>
          </section>

          <GateGrid harness={data} />
        </>
      )}
    </div>
  );
}
