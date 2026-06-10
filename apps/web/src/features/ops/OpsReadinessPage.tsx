import type {
  ExecutionWritebackExecutorRegistrationReadinessResponse,
  FinalRcProductionCandidateReadinessResponse,
  McpRealRuntimeReadinessResponse,
  ProductionActivationPreflightResponse,
  ProductionReadinessP1Response,
  PublisherRealRuntimeReadinessResponse,
} from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useFinalRcReadiness, useReadinessDrilldowns } from "./hooks.js";

type Readiness = FinalRcProductionCandidateReadinessResponse;
type Drilldowns = {
  productionActivation: ProductionActivationPreflightResponse;
  productionReadinessP1: ProductionReadinessP1Response;
  mcpRealRuntime: McpRealRuntimeReadinessResponse;
  publisherRealRuntime: PublisherRealRuntimeReadinessResponse;
  writebackExecutorRegistration: ExecutionWritebackExecutorRegistrationReadinessResponse;
};
type GateKey = keyof Readiness["gates"];
type CapabilityKey = keyof Readiness["capabilities"];

const GATES: { key: GateKey; label: string; group: string }[] = [
  { key: "production_activation_ready", label: "Production activation", group: "P0" },
  { key: "production_readiness_p1_ready", label: "P1 readiness", group: "P1" },
  { key: "agent_real_runtime_ready", label: "Agent runtime", group: "Runtime" },
  { key: "mcp_real_runtime_ready", label: "MCP runtime", group: "Runtime" },
  { key: "publisher_real_runtime_ready", label: "Publisher runtime", group: "Runtime" },
  { key: "writeback_executor_default_closed", label: "Writeback default-closed", group: "Safety" },
  { key: "execution_result_ledger_append_only", label: "Result ledger append-only", group: "Safety" },
  { key: "publish_record_version_pinned", label: "Publish record version pin", group: "Safety" },
  { key: "kill_switch_default_closed", label: "Kill switch default-closed", group: "Safety" },
  { key: "network_allowlist_configured", label: "Network allowlist", group: "Safety" },
  { key: "secret_redaction_enabled", label: "Secret redaction", group: "Safety" },
];

const CAPABILITIES: { key: CapabilityKey; label: string }[] = [
  { key: "agent_real_runtime", label: "Agent real runtime" },
  { key: "mcp_real_runtime", label: "MCP real runtime" },
  { key: "publisher_real_runtime", label: "Publisher real runtime" },
  { key: "workflow_stage_writeback", label: "Workflow stage writeback" },
];

const OPS_ENDPOINTS = {
  productionActivation: "/api/execution/ops/production-activation-preflight",
  productionReadinessP1: "/api/execution/ops/production-readiness-p1",
  mcpRealRuntime: "/api/execution/ops/mcp-real-runtime-readiness",
  publisherRealRuntime: "/api/execution/ops/publisher-real-runtime-readiness",
  writebackExecutorRegistration: "/api/execution/ops/writeback-executor-registration-readiness",
};

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function statusText(ok: boolean) {
  return ok ? "已满足" : "未满足";
}

function readyLabel(status: string) {
  return status.toUpperCase();
}

function asYesNo(value: boolean) {
  return value ? "yes" : "no";
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

function Summary({ readiness }: { readiness: Readiness }) {
  return (
    <div className="kpi-grid ops-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${readiness.candidate ? "success" : "danger"}`}>
          {readiness.status.toUpperCase()}
        </div>
        <div className="kpi-label">候选状态</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${readiness.external_call_performed ? "danger" : "success"}`}>
          {readiness.external_call_performed ? "已发生外部调用" : "未发生外部调用"}
        </div>
        <div className="kpi-label">外部副作用</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{readiness.missing_requirements.length}</div>
        <div className="kpi-label">缺失要求</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{readiness.warnings.length}</div>
        <div className="kpi-label">安全提示</div>
      </div>
    </div>
  );
}

function GateTable({ readiness }: { readiness: Readiness }) {
  return (
    <table className="table ops-table">
      <thead>
        <tr>
          <th>Gate</th>
          <th>分组</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        {GATES.map((gate) => {
          const ok = readiness.gates[gate.key];
          return (
            <tr key={gate.key}>
              <td>{gate.label}</td>
              <td>{gate.group}</td>
              <td>
                <span className={`badge ${tone(ok)}`}>{statusText(ok)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CapabilityTable({ readiness }: { readiness: Readiness }) {
  return (
    <table className="table ops-table">
      <thead>
        <tr>
          <th>Capability</th>
          <th>启用状态</th>
        </tr>
      </thead>
      <tbody>
        {CAPABILITIES.map((capability) => {
          const enabled = readiness.capabilities[capability.key];
          return (
            <tr key={capability.key}>
              <td>{capability.label}</td>
              <td>
                <span className={`badge ${enabled ? "info" : "neutral"}`}>
                  {enabled ? "已启用" : "默认关闭"}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DetailFacts({ rows }: { rows: { label: string; value: string | number | boolean }[] }) {
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

function DrilldownCard({
  title,
  endpoint,
  status,
  missing,
  warnings,
  facts,
  nextPhase,
}: {
  title: string;
  endpoint: string;
  status: "ready" | "blocked";
  missing: string[];
  warnings: string[];
  facts: { label: string; value: string | number | boolean }[];
  nextPhase?: string[];
}) {
  return (
    <section className="card ops-drilldown-card">
      <div className="ops-card-head">
        <h3>{title}</h3>
        <span className={`badge ${status === "ready" ? "success" : "danger"}`}>
          {readyLabel(status)}
        </span>
      </div>
      <code className="ops-endpoint">{endpoint}</code>
      <DetailFacts rows={facts} />

      <h4>Missing</h4>
      <MiniList items={missing} empty="当前无缺失要求。" />

      <h4>Warnings</h4>
      <MiniList items={warnings} empty="当前无提示。" />

      {nextPhase && (
        <>
          <h4>Next phase</h4>
          <MiniList items={nextPhase} empty="当前无下一阶段要求。" />
        </>
      )}
    </section>
  );
}

function DrilldownGrid({ readiness, drilldowns }: { readiness: Readiness; drilldowns: Drilldowns }) {
  const {
    productionActivation,
    productionReadinessP1,
    mcpRealRuntime,
    publisherRealRuntime,
    writebackExecutorRegistration,
  } = drilldowns;

  return (
    <section>
      <h2 className="section-title">Gate 下钻</h2>
      <div className="ops-drilldown-grid">
        <DrilldownCard
          title="Production activation preflight"
          endpoint={readiness.endpoints.production_activation ?? OPS_ENDPOINTS.productionActivation}
          status={productionActivation.status}
          missing={productionActivation.missing_requirements}
          warnings={productionActivation.warnings}
          facts={[
            { label: "runtime", value: productionActivation.runtime.mode },
            { label: "adapter", value: productionActivation.runtime.adapter_mode },
            { label: "allow network", value: asYesNo(productionActivation.runtime.allow_network) },
            { label: "agent runtime", value: asYesNo(productionActivation.capabilities.agent_real_runtime) },
          ]}
        />
        <DrilldownCard
          title="P1 production readiness"
          endpoint={readiness.endpoints.production_readiness_p1 ?? OPS_ENDPOINTS.productionReadinessP1}
          status={productionReadinessP1.status}
          missing={productionReadinessP1.missing_requirements}
          warnings={productionReadinessP1.warnings}
          facts={[
            { label: "secret store", value: asYesNo(productionReadinessP1.secret_store.connected) },
            { label: "quota ledger", value: asYesNo(productionReadinessP1.quota_ledger.table_ready) },
            { label: "alert rules", value: productionReadinessP1.alerts.rules.length },
            { label: "smoke endpoint", value: productionReadinessP1.smoke.readiness_endpoint },
          ]}
        />
        <DrilldownCard
          title="MCP real runtime"
          endpoint={readiness.endpoints.mcp_real_runtime ?? OPS_ENDPOINTS.mcpRealRuntime}
          status={mcpRealRuntime.status}
          missing={mcpRealRuntime.missing_requirements}
          warnings={mcpRealRuntime.warnings}
          facts={[
            { label: "enabled", value: asYesNo(mcpRealRuntime.enabled) },
            { label: "transport", value: mcpRealRuntime.transport_mode },
            { label: "endpoints", value: mcpRealRuntime.endpoint_registry_count },
            { label: "tool allowlist", value: mcpRealRuntime.tool_allowlist_count },
          ]}
        />
        <DrilldownCard
          title="Publisher real runtime"
          endpoint={readiness.endpoints.publisher_real_runtime ?? OPS_ENDPOINTS.publisherRealRuntime}
          status={publisherRealRuntime.status}
          missing={publisherRealRuntime.missing_requirements}
          warnings={publisherRealRuntime.warnings}
          facts={[
            { label: "enabled", value: asYesNo(publisherRealRuntime.enabled) },
            { label: "endpoints", value: publisherRealRuntime.endpoint_registry_count },
            { label: "channels", value: publisherRealRuntime.channel_allowlist_count },
            { label: "allow network", value: asYesNo(publisherRealRuntime.allow_network) },
          ]}
        />
        <DrilldownCard
          title="Writeback executor registration"
          endpoint={
            readiness.endpoints.writeback_executor_registration ??
            OPS_ENDPOINTS.writebackExecutorRegistration
          }
          status={writebackExecutorRegistration.descriptor.status}
          missing={writebackExecutorRegistration.missing_requirements}
          warnings={[]}
          nextPhase={writebackExecutorRegistration.next_phase_requirements}
          facts={[
            { label: "registered", value: asYesNo(writebackExecutorRegistration.registered) },
            { label: "executable", value: asYesNo(writebackExecutorRegistration.executable) },
            {
              label: "control writes",
              value: asYesNo(writebackExecutorRegistration.control_plane_write_allowed),
            },
            { label: "audit writes", value: asYesNo(writebackExecutorRegistration.audit_write_allowed) },
          ]}
        />
      </div>
    </section>
  );
}

export function OpsReadinessPage() {
  const { data, isLoading, isError, error } = useFinalRcReadiness();
  const drilldowns = useReadinessDrilldowns(Boolean(data));

  return (
    <div className="ops-readiness">
      <div className="page-head">
        <div>
          <h1>Final RC 门禁</h1>
          <p>生产候选只读检查</p>
        </div>
      </div>

      {isError && <ErrorBar message={`门禁加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />

          <div className="ops-grid">
            <section>
              <h2 className="section-title">候选 Gate</h2>
              <GateTable readiness={data} />
            </section>
            <section>
              <h2 className="section-title">Runtime Capability</h2>
              <CapabilityTable readiness={data} />
            </section>
          </div>

          <div className="ops-grid">
            <section className="card">
              <h2 className="section-title">缺失要求</h2>
              <MiniList items={data.missing_requirements} empty="当前无缺失要求。" />
            </section>
            <section className="card">
              <h2 className="section-title">安全提示</h2>
              <MiniList items={data.warnings} empty="当前无安全提示。" />
            </section>
          </div>

          <section className="card">
            <h2 className="section-title">非目标</h2>
            <MiniList items={data.non_goals} empty="当前无非目标说明。" />
          </section>

          {drilldowns.isLoading && <Skeleton rows={4} />}
          {drilldowns.isError && (
            <ErrorBar message={`下钻加载失败：${(drilldowns.error as Error).message}`} />
          )}
          {drilldowns.data && <DrilldownGrid readiness={data} drilldowns={drilldowns.data} />}
        </>
      )}
    </div>
  );
}
