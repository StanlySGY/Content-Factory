import type { FinalRcProductionCandidateReadinessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useFinalRcReadiness } from "./hooks.js";

type Readiness = FinalRcProductionCandidateReadinessResponse;
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

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function statusText(ok: boolean) {
  return ok ? "已满足" : "未满足";
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

export function OpsReadinessPage() {
  const { data, isLoading, isError, error } = useFinalRcReadiness();

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
        </>
      )}
    </div>
  );
}
