import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useBadgeCounts } from "../hooks/useBadgeCounts.js";
import { CollapsibleNavGroup } from "./CollapsibleNavGroup.js";

interface SidebarNavProps {
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps = {}) {
  const { isAdmin } = useAuth();
  const { counts } = useBadgeCounts();

  const handleClick = () => {
    onNavigate?.();
  };

  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="brand">⚙ Content Factory</div>

      <NavLink to="/dashboard" onClick={handleClick}>📊 工作台</NavLink>
      <NavLink to="/tasks" onClick={handleClick}>
        <span>📝 任务</span>
        {counts.runningTasks > 0 && (
          <span className="nav-badge">{counts.runningTasks}</span>
        )}
      </NavLink>
      <NavLink to="/workflows" onClick={handleClick}>🔄 工作流</NavLink>
      <NavLink to="/assets" onClick={handleClick}>🎨 素材中心</NavLink>

      <CollapsibleNavGroup
        title="⚙️ 设置"
        storageKey="nav-settings"
        pathPrefix="/settings"
      >
        <NavLink to="/settings/agents" onClick={handleClick}>Agent 管理</NavLink>
        <NavLink to="/settings/knowledge" onClick={handleClick}>知识库</NavLink>
        <NavLink to="/settings/mcp" onClick={handleClick}>MCP 工具</NavLink>
        <NavLink to="/settings/workflows" onClick={handleClick}>工作流模板</NavLink>
      </CollapsibleNavGroup>

      {isAdmin && (
        <CollapsibleNavGroup
          title="🔧 管理后台"
          storageKey="nav-admin"
          pathPrefix="/admin"
        >
          <div className="nav-section-label">内容管理</div>
          <NavLink to="/admin/reviews" onClick={handleClick}>
            <span>审核队列</span>
            {counts.pendingReviews > 0 && (
              <span className="nav-badge">{counts.pendingReviews}</span>
            )}
          </NavLink>
          <NavLink to="/admin/work-queue" onClick={handleClick}>
            <span>工作队列</span>
            {counts.workQueue > 0 && (
              <span className="nav-badge">{counts.workQueue}</span>
            )}
          </NavLink>
          <NavLink to="/admin/publisher" onClick={handleClick}>发布工作台</NavLink>

          <div className="nav-section-label">执行监控</div>
          <NavLink to="/admin/execution" onClick={handleClick}>执行日志</NavLink>
          <NavLink to="/admin/evaluations" onClick={handleClick}>评估看板</NavLink>

          <div className="nav-section-label">系统配置</div>
          <NavLink to="/admin/mcp" onClick={handleClick}>MCP 管理</NavLink>
          <NavLink to="/admin/rbac" onClick={handleClick}>权限管理</NavLink>
          <NavLink to="/admin/ops" onClick={handleClick}>运维看板</NavLink>
        </CollapsibleNavGroup>
      )}
    </nav>
  );
}
