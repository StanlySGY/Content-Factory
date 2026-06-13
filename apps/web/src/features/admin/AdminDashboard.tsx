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
        <Link to="/admin/reviews" className="admin-card">
          <div className="admin-card-icon">📋</div>
          <h3>审核队列</h3>
          <p>内容审核和批准管理</p>
          {counts.pendingReviews > 0 && (
            <span className="admin-badge">{counts.pendingReviews}</span>
          )}
        </Link>

        <Link to="/admin/work-queue" className="admin-card">
          <div className="admin-card-icon">📦</div>
          <h3>工作队列</h3>
          <p>任务队列和执行状态</p>
          {counts.workQueue > 0 && (
            <span className="admin-badge">{counts.workQueue}</span>
          )}
        </Link>

        <Link to="/admin/execution" className="admin-card">
          <div className="admin-card-icon">📊</div>
          <h3>执行日志</h3>
          <p>查看 Results / Outbox / Writebacks</p>
        </Link>

        <Link to="/admin/evaluations" className="admin-card">
          <div className="admin-card-icon">📈</div>
          <h3>评估看板</h3>
          <p>Agent 性能评估和指标</p>
        </Link>

        <Link to="/admin/publisher" className="admin-card">
          <div className="admin-card-icon">🚀</div>
          <h3>发布工作台</h3>
          <p>渠道管理和发布记录</p>
        </Link>

        <Link to="/admin/mcp" className="admin-card">
          <div className="admin-card-icon">🔌</div>
          <h3>MCP 管理</h3>
          <p>工具调用和市场管理</p>
        </Link>

        <Link to="/admin/rbac" className="admin-card">
          <div className="admin-card-icon">🔐</div>
          <h3>权限管理</h3>
          <p>角色和权限配置</p>
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
