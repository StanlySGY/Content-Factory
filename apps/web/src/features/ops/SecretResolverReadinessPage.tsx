import type { SecretResolverReadinessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useSecretResolverReadiness } from "./hooks.js";

type Readiness = SecretResolverReadinessResponse;
type FactValue = string | number | string[];

const ENDPOINT = "/api/execution/ops/secret-resolver-readiness";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readyLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function resolverLabel(readiness: Readiness) {
  return readiness.available ? "resolver available" : "resolver unavailable";
}

function resolveLabel(readiness: Readiness) {
  return readiness.resolves_secret_material
    ? "secret material resolved"
    : "secret material not resolved";
}

function returnLabel(readiness: Readiness) {
  return readiness.returns_secret_material
    ? "secret material returned"
    : "secret material not returned";
}

function envLabel(readiness: Readiness) {
  return readiness.plain_env_read_allowed ? "plain env allowed" : "plain env blocked";
}

function networkLabel(readiness: Readiness) {
  return readiness.network_used ? "network used" : "network not used";
}

function processLabel(readiness: Readiness) {
  return readiness.process_spawned ? "process spawned" : "process not spawned";
}

function DetailFacts({ rows }: { rows: { label: string; value: FactValue }[] }) {
  return (
    <dl className="ops-detail-facts secret-resolver-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {Array.isArray(row.value) ? (
              <span className="secret-resolver-list">
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
    <section className="card ops-drilldown-card secret-resolver-gate-card">
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className={`badge ${tone(status)}`}>{readyLabel(status)}</span>
      </div>
      <DetailFacts rows={rows} />
    </section>
  );
}

function Summary({ readiness }: { readiness: Readiness }) {
  const secretSafe = !readiness.resolves_secret_material && !readiness.returns_secret_material;
  const externalBoundarySafe =
    !readiness.plain_env_read_allowed && !readiness.network_used && !readiness.process_spawned;

  return (
    <div className="kpi-grid ops-kpi-grid secret-resolver-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(readiness.available)}`}>
          {resolverLabel(readiness)}
        </div>
        <div className="kpi-label">Resolver</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(secretSafe)}`}>
          {secretSafe ? "secret material safe" : "secret material exposed"}
        </div>
        <div className="kpi-label">Secret material</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(externalBoundarySafe)}`}>
          {externalBoundarySafe ? "boundary safe" : "boundary open"}
        </div>
        <div className="kpi-label">Env / Network / Process</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(readiness.allowed_ref_schemes.length > 0)}`}>
          {readiness.allowed_ref_schemes.length} ref schemes
        </div>
        <div className="kpi-label">Ref policy</div>
      </div>
    </div>
  );
}

function GateGrid({ readiness }: { readiness: Readiness }) {
  return (
    <div className="ops-drilldown-grid secret-resolver-grid">
      <GateCard
        title="Resolver"
        status={readiness.available}
        rows={[
          { label: "mode", value: "mock-only readiness" },
          { label: "kind", value: readiness.resolver_kind },
          { label: "availability", value: readiness.available ? "available" : "unavailable" },
        ]}
      />
      <GateCard
        title="Secret material"
        status={!readiness.resolves_secret_material && !readiness.returns_secret_material}
        rows={[
          { label: "resolve", value: resolveLabel(readiness) },
          { label: "return", value: returnLabel(readiness) },
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
        title="Runtime boundary"
        status={!readiness.plain_env_read_allowed && !readiness.network_used && !readiness.process_spawned}
        rows={[
          { label: "plain env", value: envLabel(readiness) },
          { label: "network", value: networkLabel(readiness) },
          { label: "process", value: processLabel(readiness) },
          { label: "adapter", value: readiness.active_adapter_mode },
          { label: "runtime", value: readiness.runtime_mode },
        ]}
      />
    </div>
  );
}

export function SecretResolverReadinessPage() {
  const { data, isLoading, isError, error } = useSecretResolverReadiness();

  return (
    <div className="secret-resolver-readiness">
      <div className="page-head">
        <div>
          <h1>Secret 解析门禁</h1>
          <p>只读 secret resolver readiness，不读取或返回 secret material，不执行外部动作</p>
        </div>
      </div>

      {isError && <ErrorBar message={`Secret 解析门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <section className="card secret-resolver-mode-card">
            <div className="ops-card-head">
              <h2>Readiness source</h2>
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
