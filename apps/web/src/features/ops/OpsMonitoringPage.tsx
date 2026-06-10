import type {
  ExecutionMonitoringReadinessResponse,
  StagingSmokeReadinessResponse,
} from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useOpsMonitoringReadiness } from "./hooks.js";

type MonitoringReadiness = ExecutionMonitoringReadinessResponse;
type SmokeReadiness = StagingSmokeReadinessResponse;
type FactRow = { label: string; value: string | number | boolean };

const MONITORING_ENDPOINT = "/api/execution/ops/monitoring-readiness";
const STAGING_SMOKE_READINESS_ENDPOINT = "/api/execution/ops/staging-smoke-readiness";

function readyLabel(status: string) {
  return status.toUpperCase();
}

function asYesNo(value: boolean) {
  return value ? "yes" : "no";
}

function sideEffectText(performed: boolean) {
  return performed ? "已发生外部调用" : "未发生外部调用";
}

function MiniList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="ops-muted">{empty}</p>;
  return (
    <ul className="ops-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function DetailFacts({ rows }: { rows: FactRow[] }) {
  return (
    <dl className="ops-detail-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{String(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusSummary({
  monitoring,
  stagingSmoke,
}: {
  monitoring: MonitoringReadiness;
  stagingSmoke: SmokeReadiness;
}) {
  return (
    <div className="kpi-grid ops-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${monitoring.ready ? "success" : "danger"}`}>
          {readyLabel(monitoring.status)}
        </div>
        <div className="kpi-label">Monitoring readiness</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${monitoring.exporter_enabled ? "success" : "neutral"}`}>
          {monitoring.exporter_format}
        </div>
        <div className="kpi-label">Metrics exporter</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${stagingSmoke.ready ? "success" : "danger"}`}>
          {readyLabel(stagingSmoke.status)}
        </div>
        <div className="kpi-label">Staging smoke</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${stagingSmoke.external_call_performed ? "danger" : "success"}`}>
          {sideEffectText(stagingSmoke.external_call_performed)}
        </div>
        <div className="kpi-label">Smoke side effect</div>
      </div>
    </div>
  );
}

function AlertRulesTable({ monitoring }: { monitoring: MonitoringReadiness }) {
  return (
    <table className="table ops-table ops-alert-table">
      <thead>
        <tr>
          <th>Rule</th>
          <th>Metric</th>
          <th>Severity</th>
          <th>Threshold</th>
          <th>Enabled</th>
        </tr>
      </thead>
      <tbody>
        {monitoring.rules.map((rule) => (
          <tr key={rule.id}>
            <td>{rule.id}</td>
            <td>{rule.metric}</td>
            <td>
              <span className={`badge ${rule.severity === "critical" ? "danger" : "info"}`}>
                {rule.severity}
              </span>
            </td>
            <td>
              {rule.comparison} {rule.threshold}
            </td>
            <td>
              <span className={`badge ${rule.enabled ? "success" : "neutral"}`}>
                {rule.enabled ? "yes" : "no"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonitoringCard({ monitoring }: { monitoring: MonitoringReadiness }) {
  return (
    <section className="card ops-drilldown-card">
      <div className="ops-card-head">
        <h2>Monitoring readiness</h2>
        <span className={`badge ${monitoring.ready ? "success" : "danger"}`}>
          {readyLabel(monitoring.status)}
        </span>
      </div>
      <code className="ops-endpoint">{MONITORING_ENDPOINT}</code>
      <DetailFacts
        rows={[
          { label: "exporter", value: asYesNo(monitoring.exporter_enabled) },
          { label: "format", value: monitoring.exporter_format },
          { label: "pull based", value: asYesNo(monitoring.pull_based) },
          { label: "network push", value: asYesNo(monitoring.network_push_enabled) },
        ]}
      />

      <h3>Alert rules</h3>
      <AlertRulesTable monitoring={monitoring} />

      <h3>Missing</h3>
      <MiniList items={monitoring.missing_requirements} empty="当前无缺失要求。" />

      <h3>Warnings</h3>
      <MiniList items={monitoring.warnings} empty="当前无提示。" />
    </section>
  );
}

function StagingSmokeCard({ stagingSmoke }: { stagingSmoke: SmokeReadiness }) {
  return (
    <section className="card ops-drilldown-card">
      <div className="ops-card-head">
        <h2>Staging smoke readiness</h2>
        <span className={`badge ${stagingSmoke.ready ? "success" : "danger"}`}>
          {readyLabel(stagingSmoke.status)}
        </span>
      </div>
      <code className="ops-endpoint">{STAGING_SMOKE_READINESS_ENDPOINT}</code>
      <DetailFacts
        rows={[
          { label: "enabled", value: asYesNo(stagingSmoke.enabled) },
          { label: "runtime", value: stagingSmoke.runtime_mode },
          { label: "max jobs", value: stagingSmoke.max_jobs },
          { label: "network push", value: asYesNo(stagingSmoke.network_push_enabled) },
        ]}
      />

      <h3>Smoke run endpoint</h3>
      <code className="ops-endpoint">{stagingSmoke.run_endpoint}</code>

      <h3>Missing</h3>
      <MiniList items={stagingSmoke.missing_requirements} empty="当前无缺失要求。" />

      <h3>Warnings</h3>
      <MiniList items={stagingSmoke.warnings} empty="当前无提示。" />
    </section>
  );
}

export function OpsMonitoringPage() {
  const { data, isLoading, isError, error } = useOpsMonitoringReadiness();

  return (
    <div className="ops-readiness ops-monitoring">
      <div className="page-head">
        <div>
          <h1>Production Ops 监控</h1>
          <p>只读监控与 staging smoke readiness</p>
        </div>
      </div>

      {isError && <ErrorBar message={`监控加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <StatusSummary monitoring={data.monitoring} stagingSmoke={data.stagingSmoke} />

          <div className="ops-grid">
            <MonitoringCard monitoring={data.monitoring} />
            <StagingSmokeCard stagingSmoke={data.stagingSmoke} />
          </div>
        </>
      )}
    </div>
  );
}
