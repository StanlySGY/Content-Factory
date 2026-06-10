import type {
  ContentTaskDTO,
  ContextPackDTO,
  KnowledgeSearchItemDTO,
  TaskKnowledgeCandidatesResponse,
} from "@cf/shared";
import { EmptyState } from "../../components/states.js";

export type ReviewData = {
  candidates: TaskKnowledgeCandidatesResponse;
  contextPacks: ContextPackDTO[];
};

function statusTone(status: string) {
  if (status === "active" || status === "ready" || status === "completed") return "success";
  if (status === "archived" || status === "draft") return "neutral";
  if (status === "blocked" || status === "failed") return "danger";
  return "info";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

export function taskCandidateQuery(task: ContentTaskDTO) {
  const summary = task.requirement_data.summary?.trim();
  return summary || task.title;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function shortBody(body: string) {
  return body.length > 150 ? `${body.slice(0, 147)}...` : body;
}

function knowledgeEntryIds(pack: ContextPackDTO) {
  const ids = pack.source_refs.knowledge_entry_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function linkedPacks(candidate: KnowledgeSearchItemDTO, packs: ContextPackDTO[]) {
  return packs.filter((pack) => knowledgeEntryIds(pack).includes(candidate.id));
}

function Summary({ taskCount, data }: { taskCount: number; data: ReviewData | undefined }) {
  const candidates = data?.candidates.items ?? [];
  const contextPacks = data?.contextPacks ?? [];
  const linkedCandidateCount = candidates.filter(
    (candidate) => linkedPacks(candidate, contextPacks).length > 0,
  ).length;

  return (
    <div className="kpi-grid candidate-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{taskCount}</div>
        <div className="kpi-label">Tasks</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{candidates.length}</div>
        <div className="kpi-label">Candidates</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{linkedCandidateCount}</div>
        <div className="kpi-label">Linked candidates</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{contextPacks.length}</div>
        <div className="kpi-label">Context packs</div>
      </div>
    </div>
  );
}

function TaskTable({
  tasks,
  selectedTaskId,
  onSelect,
}: {
  tasks: ContentTaskDTO[];
  selectedTaskId: string | undefined;
  onSelect: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState title="还没有任务" hint="创建任务后可在这里查看知识候选。" />;
  }

  return (
    <table className="table candidate-table candidate-task-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Status</th>
          <th>Query seed</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr className={task.id === selectedTaskId ? "selected" : ""} key={task.id}>
            <td>
              <button
                className="candidate-task-button"
                onClick={() => onSelect(task.id)}
                type="button"
              >
                {task.title}
              </button>
              <span>{shortId(task.id)}</span>
            </td>
            <td>
              <StatusBadge status={task.status} />
            </td>
            <td>
              <span>{taskCandidateQuery(task)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="candidate-muted">no tags</span>;

  return (
    <div className="candidate-tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}

function LinkedPackList({ packs }: { packs: ContextPackDTO[] }) {
  if (packs.length === 0) {
    return <span className="candidate-muted">未关联 context pack</span>;
  }

  return (
    <div className="candidate-linked-packs">
      <strong>已关联 context pack</strong>
      {packs.map((pack) => (
        <span key={pack.id}>{pack.scope} v{pack.version}</span>
      ))}
    </div>
  );
}

function CandidateTable({
  candidates,
  contextPacks,
}: {
  candidates: KnowledgeSearchItemDTO[];
  contextPacks: ContextPackDTO[];
}) {
  if (candidates.length === 0) {
    return <EmptyState title="没有知识候选" hint="当前任务 query 没有命中 active knowledge entry。" />;
  }

  return (
    <table className="table candidate-table candidate-result-table">
      <thead>
        <tr>
          <th>Candidate</th>
          <th>Reason</th>
          <th>Tags</th>
          <th>Context pack link</th>
        </tr>
      </thead>
      <tbody>
        {candidates.map((candidate) => (
          <tr key={candidate.id}>
            <td>
              <strong>{candidate.title}</strong>
              <span>{shortBody(candidate.body)}</span>
              <code>source {shortId(candidate.source_id)}</code>
            </td>
            <td>
              <StatusBadge status={candidate.reason} />
              <span>{candidate.status}</span>
            </td>
            <td>
              <TagList tags={candidate.tags} />
            </td>
            <td>
              <LinkedPackList packs={linkedPacks(candidate, contextPacks)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ContextPackTable({ packs }: { packs: ContextPackDTO[] }) {
  if (packs.length === 0) {
    return <EmptyState title="还没有 context pack" hint="这里只展示已有快照，不会自动物化。" />;
  }

  return (
    <table className="table candidate-table candidate-pack-table">
      <thead>
        <tr>
          <th>Pack</th>
          <th>Scope</th>
          <th>Knowledge refs</th>
        </tr>
      </thead>
      <tbody>
        {packs.map((pack) => (
          <tr key={pack.id}>
            <td>
              <strong>{shortId(pack.id)}</strong>
              <span>{new Date(pack.created_at).toLocaleString()}</span>
            </td>
            <td>
              <StatusBadge status={pack.scope} />
              <span>version {pack.version}</span>
            </td>
            <td>
              <span>{knowledgeEntryIds(pack).length} entries</span>
              <code>{JSON.stringify(pack.source_refs)}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LoadedCandidateReview({
  tasks,
  activeTask,
  data,
  onSelectTask,
}: {
  tasks: ContentTaskDTO[];
  activeTask: ContentTaskDTO | undefined;
  data: ReviewData | undefined;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <>
      <Summary data={data} taskCount={tasks.length} />
      <div className="candidate-grid">
        <section>
          <div className="candidate-section-head">
            <h2 className="section-title">Tasks</h2>
            <span>{tasks.length} loaded</span>
          </div>
          <TaskTable onSelect={onSelectTask} selectedTaskId={activeTask?.id} tasks={tasks} />
        </section>

        <section className="candidate-detail-column">
          <div className="candidate-section-head">
            <h2 className="section-title">Knowledge candidates</h2>
            <span>{activeTask ? taskCandidateQuery(activeTask) : "no task"}</span>
          </div>
          {data && (
            <CandidateTable
              candidates={data.candidates.items}
              contextPacks={data.contextPacks}
            />
          )}

          <div className="candidate-section-head">
            <h2 className="section-title">Existing context packs</h2>
            <span>read-only snapshots</span>
          </div>
          {data && <ContextPackTable packs={data.contextPacks} />}
        </section>
      </div>
    </>
  );
}
