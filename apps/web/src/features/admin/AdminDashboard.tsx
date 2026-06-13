import { Link } from "react-router-dom";
import { useBadgeCounts } from "../../hooks/useBadgeCounts.js";
import "./admin.css";

export function AdminDashboard() {
  const { counts } = useBadgeCounts();

  return (
    <div>
      <div className="page-head">
        <h1>管理后台</h1>
        <p>系统监控与配置管理</p>
      </div>

      <div className="admin-stats">
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <div className="stat-label">待审核</div>
            <div className="stat-value">{counts.pendingReviews}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <div className="stat-label">工作队列</div>
            <div className="stat-value">{counts.workQueue}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">▶️</div>
          <div className="stat-content">
            <div className="stat-label">运行中任务</div>
            <div className="stat-value">{counts.runningTasks}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-label">系统状态</div>
            <div className="stat-value healthy">正常</div>
          </div>
        </div>
      </div>

      <div className="admin-grid">
        <Link to="/admin/content" className="admin-card">
          <div className="admin-card-icon">📋</div>
          <h3>内容管理</h3>
          <p>审核队列、工作队列和发布管理</p>
          {counts.pendingReviews > 0 && (
            <span className="admin-badge">{counts.pendingReviews}</span>
          )}
        </Link>

        <Link to="/admin/agents" className="admin-card">
          <div className="admin-card-icon">🤖</div>
          <h3>Agent 运维</h3>
          <p>评估看板、MCP 工具和市场管理</p>
        </Link>

        <Link to="/admin/execution" className="admin-card">
          <div className="admin-card-icon">📊</div>
          <h3>执行监控</h3>
          <p>执行结果、发送队列和回写记录</p>
        </Link>

        <Link to="/admin/system" className="admin-card">
          <div className="admin-card-icon">⚙️</div>
          <h3>系统配置</h3>
          <p>权限管理和知识库</p>
        </Link>

        <Link to="/admin/ops" className="admin-card">
          <div className="admin-card-icon">🛠️</div>
          <h3>运维看板</h3>
          <p>系统健康度和监控</p>
        </Link>
      </div>
    </div>
  );
}
