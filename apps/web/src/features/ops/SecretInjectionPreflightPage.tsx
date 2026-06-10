import type { SecretInjectionPreflightReadinessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useSecretInjectionPreflight } from "./hooks.js";

type Readiness = SecretInjectionPreflightReadinessResponse;
type FactValue = string | number | string[];

const ENDPOINT = "/api/execution/ops/secret-injection-preflight";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function enabledLabel(value: boolean, subject: string) {
  return value ? `${subject} enabled` : `${subject} disabled`;
}

function connectedLabel(value: boolean) {
  return value ? "secret store connected" : "secret store disconnected";
}

function secretReadLabel(readiness: Readiness) {
  return readiness.secret_material_read ? "secret material read" : "secret material not read";
}

function secretReturnLabel(readiness: Readiness) {
  return readiness.secret_material_returned ? "secret material returned" : "secret material not returned";
}

function headerPlanLabel(readiness: Readiness) {
  return readiness.transport_local_header_injection_ready
    ? "header injection plan ready"
    : "header injection plan blocked";
}

function persistenceLabel(value: boolean, subject: string) {
  return value ? `${subject} allowed` : `${subject} blocked`;
}

function auditLabel(readiness: Readiness) {
  return readiness.audit_metadata_required ? "audit metadata required" : "audit metadata optional";
}

function workerLabel(readiness: Readiness) {
  return readiness.real_adapter_worker_enabled ? "worker enabled" : "worker blocked";
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts secret-injection-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {Array.isArray(row.value) ? (
              <span className="secret-injection-list">
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
    <section className="card ops-drilldown-card secret-injection-gate-card">
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
  const persistenceBlocked =
    !readiness.persist_secret_material &&
    !readiness.snapshot_persistence_allowed &&
    !readiness.dto_exposure_allowed;

  return (
    <div className="kpi-grid ops-kpi-grid secret-injection-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(!readiness.secret_store_enabled)}`}>
          {enabledLabel(readiness.secret_store_enabled, "secret store")}
        </div>
        <div className="kpi-label">Secret store</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(!readiness.secret_injection_enabled)}`}>
          {enabledLabel(readiness.secret_injection_enabled, "secret injection")}
        </div>
        <div className="kpi-label">Injection</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(secretSafe)}`}>
          {secretSafe ? "secret material safe" : "secret material exposed"}
        </div>
        <div className="kpi-label">Secret boundary</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(persistenceBlocked)}`}>
          {persistenceBlocked ? "persistence blocked" : "persistence allowed"}
        </div>
        <div className="kpi-label">Persistence</div>
      </div>
    </div>
  );
}

function GateGrid({ readiness }: { readiness: Readiness }) {
  return (
    <div className="ops-drilldown-grid secret-injection-grid">
      <GateCard
        title="Resolver"
        status={!readiness.secret_store_enabled && !readiness.secret_injection_enabled}
        rows={[
          { label: "kind", value: readiness.resolver_kind },
          { label: "store", value: enabledLabel(readiness.secret_store_enabled, "secret store") },
          { label: "injection", value: enabledLabel(readiness.secret_injection_enabled, "secret injection") },
          { label: "connection", value: connectedLabel(readiness.secret_store_connected) },
        ]}
      />
      <GateCard
        title="Secret boundary"
        status={!readiness.secret_material_read && !readiness.secret_material_returned}
        rows={[
          { label: "secret read", value: secretReadLabel(readiness) },
          { label: "secret returned", value: secretReturnLabel(readiness) },
          { label: "header plan", value: headerPlanLabel(readiness) },
        ]}
      />
      <GateCard
        title="Ref policy"
        status={readiness.allowed_ref_schemes.length > 0 && readiness.supported_purposes.length > 0}
        rows={[
          { label: "allowed refs", value: readiness.allowed_ref_schemes },
          { label: "purposes", value: readiness.supported_purposes },
        ]}
      />
      <GateCard
        title="Persistence policy"
        status={
          !readiness.persist_secret_material &&
          !readiness.snapshot_persistence_allowed &&
          !readiness.dto_exposure_allowed
        }
        rows={[
          { label: "secret material", value: persistenceLabel(readiness.persist_secret_material, "secret persistence") },
          {
            label: "snapshot",
            value: persistenceLabel(readiness.snapshot_persistence_allowed, "snapshot persistence"),
          },
          { label: "DTO", value: persistenceLabel(readiness.dto_exposure_allowed, "DTO exposure") },
          { label: "audit", value: auditLabel(readiness) },
        ]}
      />
      <GateCard
        title="Runtime gate"
        status={!readiness.real_adapter_worker_enabled}
        rows={[
          { label: "worker", value: workerLabel(readiness) },
          { label: "allow runtime", value: yesNo(readiness.allow_real_runtime) },
          { label: "allow network", value: yesNo(readiness.allow_network) },
          { label: "adapter", value: readiness.active_adapter_mode },
          { label: "runtime", value: readiness.runtime_mode },
          { label: "reason", value: readiness.blocked_real_adapter_reason },
        ]}
      />
    </div>
  );
}

export function SecretInjectionPreflightPage() {
  const { data, isLoading, isError, error } = useSecretInjectionPreflight();

  return (
    <div className="secret-injection-preflight">
      <div className="page-head">
        <div>
          <h1>Secret 注入门禁</h1>
          <p>只读 secret injection preflight，不读取 secret、不注入 header、不执行 transport</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Secret 注入门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <section className="card secret-injection-mode-card">
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
