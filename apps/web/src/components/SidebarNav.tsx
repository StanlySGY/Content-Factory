import { NavLink } from "react-router-dom";

const FUTURE = ["MCP 管理", "RBAC 管理", "评估看板"];

export function SidebarNav() {
  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="brand">⚙ Content Factory</div>
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/content/tasks">内容中心</NavLink>
      <NavLink to="/workflows">工作流</NavLink>
      <NavLink to="/reviews">审核台</NavLink>
      <NavLink to="/reviews/pending">待审队列</NavLink>
      <NavLink to="/work-queue">工作队列</NavLink>
      <NavLink to="/agents">Agent 管理</NavLink>
      <NavLink to="/assets">素材中心</NavLink>
      <NavLink to="/knowledge">知识库</NavLink>
      <NavLink to="/publisher">发布工作台</NavLink>
      <NavLink to="/ops/readiness">运维门禁</NavLink>
      <NavLink to="/ops/monitoring">运维监控</NavLink>
      <div className="nav-group">后续 Sprint</div>
      {FUTURE.map((label) => (
        <span className="nav-disabled" key={label} title="后续 Sprint 交付">
          {label}
        </span>
      ))}
    </nav>
  );
}
