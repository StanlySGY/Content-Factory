import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { CollapsibleNavGroup } from "./CollapsibleNavGroup.js";

export function SidebarNav() {
  const { isAdmin } = useAuth();

  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="brand">⚙ Content Factory</div>

      <NavLink to="/dashboard">📊 工作台</NavLink>
      <NavLink to="/tasks">📝 任务</NavLink>
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
          <NavLink to="/admin/reviews">审核队列</NavLink>
          <NavLink to="/admin/work-queue">工作队列</NavLink>
          <NavLink to="/admin/execution">执行日志</NavLink>
          <NavLink to="/admin/evaluations">评估看板</NavLink>
          <NavLink to="/admin/mcp">MCP 管理</NavLink>
          <NavLink to="/admin/ops">运维看板</NavLink>
          <NavLink to="/admin/rbac">权限管理</NavLink>
          <NavLink to="/admin/publisher">发布工作台</NavLink>
        </CollapsibleNavGroup>
      )}
    </nav>
  );
}
