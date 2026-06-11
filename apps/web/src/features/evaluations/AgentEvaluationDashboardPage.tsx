import { useEffect, useMemo, useState } from "react";
import type {
  EvaluationCostAttributionResponse,
  EvaluationModelComparisonResponse,
  ExecutionEvaluationAnalyticsDTO,
  ExecutionResultEvaluationDTO,
  LowQualityEvaluationsResponse,
} from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import {
  DEFAULT_LOW_QUALITY_QUERY,
  useEvaluationDashboard,
  useExecutionResultEvaluations,
} from "./hooks.js";

type LowQualityItem = LowQualityEvaluationsResponse["items"][number];
type CostAttributionItem = EvaluationCostAttributionResponse["items"][number];
type EvaluationDashboardData = {
  analytics: ExecutionEvaluationAnalyticsDTO;
  lowQuality: LowQualityEvaluationsResponse;
  modelComparison: EvaluationModelComparisonResponse;
  costAttribution: EvaluationCostAttributionResponse;
};

function statusTone(score: number) {
  if (score < 50) return "danger";
  if (score < DEFAULT_LOW_QUALITY_QUERY.threshold) return "running";
  return "success";
}

function ScoreBadge({ score }: { score: number }) {
  return <span className={`badge ${statusTone(score)}`}>{score}</span>;
}

function formatNumber(value: number | null) {
  if (value === null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function renderDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function tagList(tags: string[]) {
  if (tags.length === 0) return <span className="evaluation-muted">none</span>;

  return (
    <div className="evaluation-tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}

function Summary({ analytics }: { analytics: ExecutionEvaluationAnalyticsDTO }) {
  return (
    <div className="kpi-grid evaluation-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{analytics.evaluation_count}</div>
        <div className="kpi-label">Evaluations</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{formatNumber(analytics.average_quality_score)}</div>
        <div className="kpi-label">Avg quality</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{formatNumber(analytics.average_cost_score)}</div>
        <div className="kpi-label">Avg cost</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{formatNumber(analytics.average_latency_score)}</div>
        <div className="kpi-label">Avg latency</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value danger-text">{analytics.low_quality_count}</div>
        <div className="kpi-label">Low quality</div>
      </div>
    </div>
  );
}

function DistributionCard({ analytics }: { analytics: ExecutionEvaluationAnalyticsDTO }) {
  const entries = Object.entries(analytics.evaluator_type_counts);

  return (
    <section className="card evaluation-distribution-card">
      <div className="evaluation-card-head">
        <div>
          <h2>Evaluator distribution</h2>
          <span>{analytics.result_count} results / {analytics.job_count} jobs</span>
        </div>
        <span className="evaluation-muted">latest {renderDate(analytics.latest_evaluated_at)}</span>
      </div>
      {entries.length > 0 ? (
        <div className="evaluation-distribution">
          {entries.map(([type, count]) => (
            <div key={type}>
              <strong>{type}</strong>
              <span>{count}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="还没有评估分布" hint="创建 evaluation 后会显示 evaluator 类型分布。" />
      )}
    </section>
  );
}

function ModelComparisonCard({
  modelComparison,
}: {
  modelComparison: EvaluationModelComparisonResponse;
}) {
  return (
    <section className="card evaluation-comparison-card">
      <div className="evaluation-card-head">
        <div>
          <h2>Model comparison</h2>
          <span>{modelComparison.compared_model_count} compared models</span>
        </div>
        <span className="evaluation-muted">
          {modelComparison.unclassified_evaluation_count} unclassified evaluations
        </span>
      </div>
      {modelComparison.items.length > 0 ? (
        <table className="table evaluation-table evaluation-model-comparison-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Composite</th>
              <th>Scores</th>
              <th>Coverage</th>
              <th>Latest</th>
            </tr>
          </thead>
          <tbody>
            {modelComparison.items.map((item) => (
              <tr key={item.model}>
                <td>
                  <strong>{item.model}</strong>
                  <span>{item.evaluation_count} evaluations</span>
                </td>
                <td>
                  <ScoreBadge score={Math.round(item.composite_score)} />
                  <span>{formatNumber(item.composite_score)}</span>
                </td>
                <td>
                  Q {formatNumber(item.average_quality_score)} / C{" "}
                  {formatNumber(item.average_cost_score)} / L{" "}
                  {formatNumber(item.average_latency_score)}
                </td>
                <td>
                  {item.result_count} results / {item.job_count} jobs
                </td>
                <td>{renderDate(item.latest_evaluated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="暂无模型对比" hint="带有 model:<id> tag 的 evaluation 会出现在这里。" />
      )}
    </section>
  );
}

function CostAttributionSummary({
  costAttribution,
}: {
  costAttribution: EvaluationCostAttributionResponse;
}) {
  return (
    <div className="evaluation-cost-summary">
      <div>
        <strong>{costAttribution.total_estimated_cost_cents} cents estimated</strong>
        <span>persisted provider metadata</span>
      </div>
      <div>
        <strong>{costAttribution.token_usage_totals.total_tokens} total tokens</strong>
        <span>
          {costAttribution.token_usage_totals.prompt_tokens} prompt /{" "}
          {costAttribution.token_usage_totals.completion_tokens} completion
        </span>
      </div>
      <div>
        <strong>{costAttribution.llm_calls_performed ? "LLM calls" : "No LLM calls"}</strong>
        <span>{costAttribution.writes_performed ? "writes performed" : "read-only attribution"}</span>
      </div>
    </div>
  );
}

function CostSourceChips({ sourceCounts }: { sourceCounts: Record<string, number> }) {
  const sourceEntries = Object.entries(sourceCounts);

  return (
    <div className="evaluation-cost-sources">
      {sourceEntries.length > 0 ? (
        sourceEntries.map(([source, count]) => (
          <span key={source}>
            <strong>{source}</strong>
            {count}
          </span>
        ))
      ) : (
        <span className="evaluation-muted">no attributed cost sources</span>
      )}
    </div>
  );
}

function CostAttributionRow({ item }: { item: CostAttributionItem }) {
  return (
    <tr>
      <td>
        <strong>{shortId(item.execution_result_id)}</strong>
        <span>{item.evaluator_type} / cost score {item.cost_score}</span>
      </td>
      <td>
        {item.cost_estimate ? (
          <>
            <strong>{item.cost_estimate.amount_cents} {item.cost_estimate.currency}</strong>
            <span>{item.cost_estimate.source}</span>
          </>
        ) : (
          <span>unattributed</span>
        )}
      </td>
      <td>
        {item.token_usage ? (
          <>
            <strong>{item.token_usage.total_tokens} total</strong>
            <span>{item.token_usage.prompt_tokens} prompt / {item.token_usage.completion_tokens} completion</span>
          </>
        ) : (
          <span>-</span>
        )}
      </td>
      <td>
        {item.quota_decision ? (
          <>
            <strong>{item.quota_decision.status} / {item.quota_decision.distributed ? "distributed" : "local"}</strong>
            <span>{item.quota_decision.used_requests} requests / {item.quota_decision.used_cost_cents} cents</span>
          </>
        ) : (
          <span>-</span>
        )}
      </td>
    </tr>
  );
}

function CostAttributionTable({ items }: { items: CostAttributionItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="暂无成本归因" hint="带 provider runtime metadata 的 evaluation 会出现在这里。" />;
  }

  return (
    <table className="table evaluation-table evaluation-cost-attribution-table">
      <thead>
        <tr>
          <th>Result</th>
          <th>Cost estimate</th>
          <th>Tokens</th>
          <th>Quota</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <CostAttributionRow item={item} key={item.evaluation_id} />
        ))}
      </tbody>
    </table>
  );
}

function CostAttributionCard({
  costAttribution,
}: {
  costAttribution: EvaluationCostAttributionResponse;
}) {
  return (
    <section className="card evaluation-cost-card">
      <div className="evaluation-card-head">
        <div>
          <h2>Cost attribution</h2>
          <span>{costAttribution.evaluation_count} evaluations</span>
        </div>
        <span className="evaluation-muted">
          {costAttribution.attributed_evaluation_count} attributed /{" "}
          {costAttribution.unattributed_evaluation_count} unattributed
        </span>
      </div>
      <CostAttributionSummary costAttribution={costAttribution} />
      <CostSourceChips sourceCounts={costAttribution.cost_source_counts} />
      <CostAttributionTable items={costAttribution.items} />
    </section>
  );
}

function LowQualityTable({
  items,
  selectedResultId,
  onSelect,
}: {
  items: LowQualityItem[];
  selectedResultId: string | undefined;
  onSelect: (resultId: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState title="暂无低分结果" hint="低于阈值的 execution result 会出现在这里。" />;
  }

  return (
    <table className="table evaluation-table evaluation-low-quality-table">
      <thead>
        <tr>
          <th>Result</th>
          <th>Evaluator</th>
          <th>Lowest</th>
          <th>Scores</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            className={item.execution_result_id === selectedResultId ? "selected" : ""}
            key={item.evaluation_id}
          >
            <td>
              <button
                className="evaluation-result-button"
                onClick={() => onSelect(item.execution_result_id)}
                type="button"
              >
                {shortId(item.execution_result_id)}
              </button>
              <span>job {shortId(item.execution_job_id)}</span>
            </td>
            <td>{item.evaluator_type}</td>
            <td>
              <ScoreBadge score={item.lowest_score} />
            </td>
            <td>
              Q {item.quality_score} / C {item.cost_score} / L {item.latency_score}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SelectedLowQualityCard({ item }: { item: LowQualityItem | undefined }) {
  if (!item) {
    return <EmptyState title="请选择低分结果" hint="选中 result 后显示完整标识与 evaluation ledger。" />;
  }

  return (
    <section className="card evaluation-selected-card">
      <div className="evaluation-card-head">
        <div>
          <h2>Selected low-quality result</h2>
          <span>threshold {DEFAULT_LOW_QUALITY_QUERY.threshold}</span>
        </div>
        <ScoreBadge score={item.lowest_score} />
      </div>
      <dl className="detail-grid evaluation-detail-grid">
        <dt>Result id</dt>
        <dd>
          <code>{item.execution_result_id}</code>
        </dd>
        <dt>Job id</dt>
        <dd>
          <code>{item.execution_job_id}</code>
        </dd>
        <dt>Evaluated</dt>
        <dd>{renderDate(item.created_at)}</dd>
        <dt>Tags</dt>
        <dd>{item.tags.length} total</dd>
      </dl>
    </section>
  );
}

function EvaluationTable({ evaluations }: { evaluations: ExecutionResultEvaluationDTO[] }) {
  if (evaluations.length === 0) {
    return <EmptyState title="还没有 result evaluation" hint="该 execution result 尚未被人工或规则评价。" />;
  }

  return (
    <table className="table evaluation-table evaluation-ledger-table">
      <thead>
        <tr>
          <th>Evaluator</th>
          <th>Scores</th>
          <th>Notes</th>
          <th>Tags</th>
        </tr>
      </thead>
      <tbody>
        {evaluations.map((evaluation) => (
          <tr key={evaluation.id}>
            <td>
              <strong>{evaluation.evaluator_type}</strong>
              <span>{renderDate(evaluation.created_at)}</span>
            </td>
            <td>
              Q {evaluation.quality_score} / C {evaluation.cost_score} / L {evaluation.latency_score}
            </td>
            <td>{evaluation.notes ?? "-"}</td>
            <td>{tagList(evaluation.tags)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EvaluationDetailColumn({
  activeResultId,
  selectedItem,
}: {
  activeResultId: string | undefined;
  selectedItem: LowQualityItem | undefined;
}) {
  const evaluationsQuery = useExecutionResultEvaluations(activeResultId);

  return (
    <section className="evaluation-detail-column">
      <SelectedLowQualityCard item={selectedItem} />
      {evaluationsQuery.isError && (
        <ErrorBar message={`result evaluations 加载失败：${(evaluationsQuery.error as Error).message}`} />
      )}
      {activeResultId && evaluationsQuery.isLoading && <Skeleton rows={4} />}
      {evaluationsQuery.data && (
        <>
          <div className="evaluation-section-head">
            <h2 className="section-title">Result evaluations</h2>
            <span>{evaluationsQuery.data.length} total</span>
          </div>
          <EvaluationTable evaluations={evaluationsQuery.data} />
        </>
      )}
    </section>
  );
}

function LoadedEvaluationDashboard({ data }: { data: EvaluationDashboardData }) {
  const [selectedResultId, setSelectedResultId] = useState<string>();
  const lowQualityItems = useMemo(() => data.lowQuality.items, [data.lowQuality.items]);
  const firstLowQualityItem = lowQualityItems[0];
  const activeResultId = selectedResultId ?? firstLowQualityItem?.execution_result_id;
  const selectedItem = lowQualityItems.find((item) => item.execution_result_id === activeResultId);

  useEffect(() => {
    if (lowQualityItems.length === 0) {
      setSelectedResultId(undefined);
      return;
    }

    if (
      firstLowQualityItem &&
      (!selectedResultId ||
        !lowQualityItems.some((item) => item.execution_result_id === selectedResultId))
    ) {
      setSelectedResultId(firstLowQualityItem.execution_result_id);
    }
  }, [firstLowQualityItem, lowQualityItems, selectedResultId]);

  return (
    <>
      <Summary analytics={data.analytics} />
      <DistributionCard analytics={data.analytics} />
      <ModelComparisonCard modelComparison={data.modelComparison} />
      <CostAttributionCard costAttribution={data.costAttribution} />

      <div className="evaluation-grid">
        <section>
          <div className="evaluation-section-head">
            <h2 className="section-title">Low-quality results</h2>
            <span>{data.lowQuality.items.length} total</span>
          </div>
          <LowQualityTable
            items={data.lowQuality.items}
            onSelect={setSelectedResultId}
            selectedResultId={activeResultId}
          />
        </section>

        <EvaluationDetailColumn activeResultId={activeResultId} selectedItem={selectedItem} />
      </div>
    </>
  );
}

export function AgentEvaluationDashboardPage() {
  const dashboardQuery = useEvaluationDashboard();

  return (
    <div className="evaluation-dashboard">
      <div className="page-head">
        <div>
          <h1>评估看板</h1>
          <p>只读 evaluation analytics、模型对比、成本归因、低分结果与 result evaluation ledger</p>
        </div>
      </div>

      {dashboardQuery.isError && (
        <ErrorBar message={`评估看板加载失败：${(dashboardQuery.error as Error).message}`} />
      )}
      {dashboardQuery.isLoading && <Skeleton rows={5} />}

      {dashboardQuery.data && <LoadedEvaluationDashboard data={dashboardQuery.data} />}
    </div>
  );
}
