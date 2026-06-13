import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useBadgeCounts } from "../hooks/useBadgeCounts.js";
import { CollapsibleNavGroup } from "./CollapsibleNavGroup.js";

export function SidebarNav() {
  const { isAdmin } = useAuth();
  const { counts } = useBadgeCounts();

  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="brand">⚙ Content Factory</div>

      <NavLink to="/dashboard">📊 工作台</NavLink>
      <NavLink to="/tasks">
        <span>📝 任务</span>
        {counts.runningTasks > 0 && (
          <span className="nav-badge">{counts.runningTasks}</span>
        )}
      </NavLink>
      <NavLink to="/workflows">🔄 工作流</NavLink>
      <NavLink to="/assets">🎨 素材中心</NavLink>

      <CollapsibleNavGroup
        title="⚙️ 设置"
        storageKey="nav-settings"
        pathPrefix="/settings"
      >
        <NavLink to="/settings/agents">Agent 管理</NavLink>
        <NavLink to="/settings/knowledge">知识库</NavLink>
        <NavLink to="/settings/mcp">MCP 工具</NavLink>
        <NavLink to="/settings/workflows">工作流模板</NavLink>
      </CollapsibleNavGroup>

      {isAdmin && (
        <CollapsibleNavGroup
          title="🔧 管理后台"
          storageKey="nav-admin"
          pathPrefix="/admin"
        >
          <div className="nav-section-label">内容管理</div>
          <NavLink to="/admin/reviews">
            <span>审核队列</span>
            {counts.pendingReviews > 0 && (
              <span className="nav-badge">{counts.pendingReviews}</span>
            )}
          </NavLink>
          <NavLink to="/admin/work-queue">
            <span>工作队列</span>
            {counts.workQueue > 0 && (
              <span className="nav-badge">{counts.workQueue}</span>
            )}
          </NavLink>
          <NavLink to="/admin/publisher">发布工作台</NavLink>

          <div className="nav-section-label">执行监控</div>
          <NavLink to="/admin/execution">执行日志</NavLink>
          <NavLink to="/admin/evaluations">评估看板</NavLink>

          <div className="nav-section-label">系统配置</div>
          <NavLink to="/admin/mcp">MCP 管理</NavLink>
          <NavLink to="/admin/rbac">权限管理</NavLink>
          <NavLink to="/admin/ops">运维看板</NavLink>
        </CollapsibleNavGroup>
      )}
    </nav>
  );
}
