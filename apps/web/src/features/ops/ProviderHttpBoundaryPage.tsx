import type { ProviderHttpBoundaryResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useProviderHttpBoundary } from "./hooks.js";

type Boundary = ProviderHttpBoundaryResponse;
type FactValue = string | number | string[];

const ENDPOINT = "/api/execution/ops/provider-http-boundary";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function clientLabel(boundary: Boundary) {
  return boundary.http_client_kind === "fake" ? "fake HTTP client" : `${boundary.http_client_kind} HTTP client`;
}

function networkLabel(boundary: Boundary) {
  return boundary.network_used ? "network used" : "network not used";
}

function realHttpLabel(boundary: Boundary) {
  return boundary.real_http_enabled ? "real HTTP enabled" : "real HTTP disabled";
}

function supportLabel(value: boolean, subject: string) {
  return value ? `${subject} supported` : `${subject} blocked`;
}

function secretLabel(boundary: Boundary) {
  return boundary.secret_material_injected
    ? "secret material injected"
    : "secret material not injected";
}

function secretDetailLabel(boundary: Boundary) {
  return boundary.secret_material_injected ? "injected" : "not injected";
}

function adapterModeLabel(mode: string) {
  return mode === "provider_preflight" ? "provider preflight allowed" : `${mode} allowed`;
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts provider-http-boundary-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {Array.isArray(row.value) ? (
              <span className="provider-http-boundary-list">
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
    <section className="card ops-drilldown-card provider-http-boundary-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ boundary }: { boundary: Boundary }) {
  const boundarySafe = !boundary.network_used && !boundary.real_http_enabled;
  const mappingReady =
    boundary.supports_abort_signal &&
    boundary.supports_timeout_mapping &&
    boundary.supports_provider_request_id &&
    boundary.supports_status_code_mapping;

  return (
    <div className="kpi-grid ops-kpi-grid provider-http-boundary-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(boundary.http_client_kind === "fake")}`}>
          {clientLabel(boundary)}
        </div>
        <div className="kpi-label">HTTP client</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(boundarySafe)}`}>
          {boundarySafe ? "network boundary safe" : "network boundary open"}
        </div>
        <div className="kpi-label">Network</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(mappingReady)}`}>
          {mappingReady ? "HTTP mappings ready" : "HTTP mappings blocked"}
        </div>
        <div className="kpi-label">Mappings</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(!boundary.secret_material_injected)}`}>
          {secretLabel(boundary)}
        </div>
        <div className="kpi-label">Secret boundary</div>
      </div>
    </div>
  );
}

function GateGrid({ boundary }: { boundary: Boundary }) {
  return (
    <div className="ops-drilldown-grid provider-http-boundary-grid">
      <GateCard
        title="HTTP client"
        status={boundary.http_client_kind === "fake"}
        rows={[
          { label: "client", value: boundary.http_client_kind },
          { label: "real HTTP", value: realHttpLabel(boundary) },
          { label: "mode", value: "provider HTTP boundary" },
        ]}
      />
      <GateCard
        title="External boundary"
        status={!boundary.network_used && !boundary.secret_material_injected}
        rows={[
          { label: "network", value: networkLabel(boundary) },
          { label: "secret injection", value: secretDetailLabel(boundary) },
        ]}
      />
      <GateCard
        title="Mapping support"
        status={
          boundary.supports_abort_signal &&
          boundary.supports_timeout_mapping &&
          boundary.supports_provider_request_id &&
          boundary.supports_status_code_mapping
        }
        rows={[
          { label: "abort", value: supportLabel(boundary.supports_abort_signal, "abort signal") },
          { label: "timeout", value: supportLabel(boundary.supports_timeout_mapping, "timeout mapping") },
          {
            label: "request id",
            value: supportLabel(boundary.supports_provider_request_id, "provider request id"),
          },
          {
            label: "status code",
            value: supportLabel(boundary.supports_status_code_mapping, "status code mapping"),
          },
        ]}
      />
      <GateCard
        title="Runtime gate"
        status={boundary.active_adapter_mode === "provider_preflight"}
        rows={[
          { label: "adapter", value: boundary.active_adapter_mode },
          { label: "runtime", value: boundary.runtime_mode },
          { label: "allowed modes", value: boundary.allowed_adapter_modes.map(adapterModeLabel) },
          { label: "reason", value: boundary.blocked_real_adapter_reason },
        ]}
      />
    </div>
  );
}

export function ProviderHttpBoundaryPage() {
  const { data, isLoading, isError, error } = useProviderHttpBoundary();

  return (
    <div className="provider-http-boundary">
      <div className="page-head">
        <div>
          <h1>Provider HTTP 边界</h1>
          <p>只读 provider HTTP boundary，不执行真实网络请求、不注入 secret material</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Provider HTTP 边界加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary boundary={data} />

          <section className="card provider-http-boundary-mode-card">
            <div className="ops-card-head">
              <h2>Boundary source</h2>
              <span className="badge info">{data.mode}</span>
            </div>
            <code className="ops-endpoint">{ENDPOINT}</code>
          </section>

          <GateGrid boundary={data} />
        </>
      )}
    </div>
  );
}
