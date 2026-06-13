import { Link } from "react-router-dom";

interface ModuleCard {
  title: string;
  description: string;
  path: string;
  icon: string;
  stats?: { label: string; value: string | number };
}

const modules: ModuleCard[] = [
  {
    title: "执行结果",
    description: "查看 Agent/MCP 执行结果、状态和快照",
    path: "/admin/execution/results",
    icon: "📊",
    stats: { label: "总记录", value: "-" },
  },
  {
    title: "Outbox 事件",
    description: "追踪异步事件投递和重试状态",
    path: "/admin/execution/outbox",
    icon: "📤",
    stats: { label: "待投递", value: "-" },
  },
  {
    title: "回写账本",
    description: "审计 Workflow Stage 状态回写记录",
    path: "/admin/execution/writebacks",
    icon: "✍️",
    stats: { label: "计划中", value: "-" },
  },
];

export function ExecutionOverviewPage() {
  return (
    <div className="container">
      <header className="page-header">
        <h1>执行日志</h1>
        <p className="subtitle">
          执行结果、事件投递和状态回写的统一视图
        </p>
      </header>

      <div className="module-grid">
        {modules.map((module) => (
          <Link
            key={module.path}
            to={module.path}
            className="module-card"
          >
            <div className="module-icon">{module.icon}</div>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            {module.stats && (
              <div className="module-stats">
                <span className="stats-label">{module.stats.label}</span>
                <span className="stats-value">{module.stats.value}</span>
              </div>
            )}
          </Link>
        ))}
      </div>

      <section style={{ marginTop: "var(--sp-8)" }}>
        <h2 style={{ marginBottom: "var(--sp-4)" }}>快速操作</h2>
        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
          <Link to="/admin/execution/results" className="button button-secondary">
            查看最新结果
          </Link>
          <Link to="/admin/execution/outbox" className="button button-secondary">
            检查 Outbox 状态
          </Link>
        </div>
      </section>
    </div>
  );
}
