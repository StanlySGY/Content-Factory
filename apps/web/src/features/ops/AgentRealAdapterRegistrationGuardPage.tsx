import type { AgentRealAdapterRegistrationGuardResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useAgentRealAdapterRegistrationGuard } from "./hooks.js";

type Readiness = AgentRealAdapterRegistrationGuardResponse;
type FactValue = string | number | string[];

const ENDPOINT = "/api/execution/ops/agent-real-adapter-registration-guard";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function registrationLabel(readiness: Readiness) {
  return readiness.registration_ready ? "registration ready" : "registration blocked";
}

function adapterLabel(readiness: Readiness) {
  return readiness.real_adapter_registered ? "adapter registered" : "adapter not registered";
}

function workerLabel(readiness: Readiness) {
  return readiness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked";
}

function fixtureReadyLabel(readiness: Readiness) {
  return readiness.disabled_fixture_ready ? "disabled fixture ready" : "disabled fixture missing";
}

function fixtureExecutableLabel(readiness: Readiness) {
  return readiness.disabled_fixture_executable ? "fixture executable" : "fixture not executable";
}

function runtimeLabel(value: boolean) {
  return value ? "allow real runtime" : "real runtime blocked";
}

function networkLabel(value: boolean) {
  return value ? "network allowed" : "network blocked";
}

function processSpawnLabel(value: boolean) {
  return value ? "process spawn allowed" : "process spawn blocked";
}

function credentialRefLabel(value: boolean) {
  return value ? "credential ref required" : "credential ref optional";
}

function snapshotsLabel(value: boolean) {
  return value ? "snapshots redacted" : "snapshots exposed";
}

function readinessGateLabel(value: boolean, subject: string) {
  return value ? `${subject} ready` : `${subject} blocked`;
}

function retryableLabel(readiness: Readiness) {
  return readiness.fail_closed_error.retryable ? "retryable" : "not retryable";
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts registration-guard-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {Array.isArray(row.value) ? (
              <span className="registration-guard-list">
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
    <section className="card ops-drilldown-card registration-guard-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ readiness }: { readiness: Readiness }) {
  const fixtureBlocked = readiness.disabled_fixture_ready && !readiness.disabled_fixture_executable;

  return (
    <div className="kpi-grid ops-kpi-grid registration-guard-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(readiness.registration_ready)}`}>
          {registrationLabel(readiness)}
        </div>
        <div className="kpi-label">Registration</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(readiness.real_adapter_registered)}`}>
          {adapterLabel(readiness)}
        </div>
        <div className="kpi-label">Real adapter</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(!readiness.real_adapter_worker_enabled)}`}>
          {workerLabel(readiness)}
        </div>
        <div className="kpi-label">Worker</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(fixtureBlocked)}`}>
          {fixtureReadyLabel(readiness)}
        </div>
        <div className="kpi-label">Disabled fixture</div>
      </div>
    </div>
  );
}

function GateGrid({ readiness }: { readiness: Readiness }) {
  return (
    <div className="ops-drilldown-grid registration-guard-grid">
      <GateCard
        title="Descriptor"
        status={readiness.descriptor_status === "blocked" && !readiness.real_adapter_registered}
        rows={[
          { label: "descriptor", value: readiness.descriptor_status },
          { label: "adapter", value: readiness.real_adapter_registered ? "registered" : "not registered" },
          { label: "worker", value: workerLabel(readiness) },
          { label: "type", value: readiness.required_adapter_type },
          { label: "mode", value: readiness.required_adapter_mode },
          { label: "reason", value: readiness.blocked_real_adapter_reason },
        ]}
      />
      <GateCard
        title="Disabled fixture"
        status={readiness.disabled_fixture_ready && !readiness.disabled_fixture_executable}
        rows={[
          { label: "readiness", value: readiness.disabled_fixture_ready ? "ready" : "missing" },
          { label: "execution", value: fixtureExecutableLabel(readiness) },
          { label: "name", value: readiness.disabled_fixture.name },
          { label: "version", value: readiness.disabled_fixture.version },
          { label: "status", value: readiness.disabled_fixture.status },
        ]}
      />
      <GateCard
        title="Config gates"
        status={
          readiness.config_gates.allow_real_runtime &&
          readiness.config_gates.allow_network &&
          !readiness.config_gates.allow_process_spawn &&
          readiness.config_gates.require_credential_ref &&
          readiness.config_gates.redact_snapshots
        }
        rows={[
          { label: "runtime", value: readiness.config_gates.runtime_mode },
          { label: "adapter mode", value: readiness.config_gates.active_adapter_mode },
          { label: "runtime gate", value: runtimeLabel(readiness.config_gates.allow_real_runtime) },
          { label: "network", value: networkLabel(readiness.config_gates.allow_network) },
          { label: "process", value: processSpawnLabel(readiness.config_gates.allow_process_spawn) },
          { label: "credential", value: credentialRefLabel(readiness.config_gates.require_credential_ref) },
          { label: "snapshots", value: snapshotsLabel(readiness.config_gates.redact_snapshots) },
        ]}
      />
      <GateCard
        title="Readiness gates"
        status={
          readiness.readiness_gates.network_allowlist_ready &&
          readiness.readiness_gates.secret_store_ready &&
          readiness.readiness_gates.secret_injection_ready &&
          readiness.readiness_gates.real_transport_ready &&
          readiness.readiness_gates.timeout_abort_ready &&
          readiness.readiness_gates.quota_preflight_ready &&
          readiness.readiness_gates.cost_preflight_ready
        }
        rows={[
          {
            label: "network allowlist",
            value: readinessGateLabel(readiness.readiness_gates.network_allowlist_ready, "network allowlist"),
          },
          {
            label: "secret store",
            value: readinessGateLabel(readiness.readiness_gates.secret_store_ready, "secret store"),
          },
          {
            label: "secret injection",
            value: readinessGateLabel(readiness.readiness_gates.secret_injection_ready, "secret injection"),
          },
          {
            label: "real transport",
            value: readinessGateLabel(readiness.readiness_gates.real_transport_ready, "real transport"),
          },
          {
            label: "timeout abort",
            value: readinessGateLabel(readiness.readiness_gates.timeout_abort_ready, "timeout abort"),
          },
          {
            label: "quota preflight",
            value: readinessGateLabel(readiness.readiness_gates.quota_preflight_ready, "quota preflight"),
          },
          {
            label: "cost preflight",
            value: readinessGateLabel(readiness.readiness_gates.cost_preflight_ready, "cost preflight"),
          },
        ]}
      />
      <GateCard
        title="Missing requirements"
        status={readiness.missing_requirements.length === 0}
        rows={[
          {
            label: "requirements",
            value: readiness.missing_requirements.length > 0 ? readiness.missing_requirements : ["none"],
          },
        ]}
      />
      <GateCard
        title="Fail closed"
        status={!readiness.fail_closed_error.retryable}
        rows={[
          { label: "message", value: readiness.fail_closed_error.message },
          { label: "retry", value: retryableLabel(readiness) },
        ]}
      />
    </div>
  );
}

export function AgentRealAdapterRegistrationGuardPage() {
  const { data, isLoading, isError, error } = useAgentRealAdapterRegistrationGuard();

  return (
    <div className="agent-registration-guard">
      <div className="page-head">
        <div>
          <h1>Agent 注册门禁</h1>
          <p>只读 agent real adapter registration guard，不注册真实 adapter、不启动 worker</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Agent 注册门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <section className="card registration-guard-mode-card">
            <div className="ops-card-head">
              <h2>Guard source</h2>
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
