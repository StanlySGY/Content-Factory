import { NavLink } from "react-router-dom";

const FUTURE = ["知识库", "Agent 管理", "MCP 管理", "公众号工作台"];

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
      <NavLink to="/assets">素材中心</NavLink>
      <div className="nav-group">后续 Sprint</div>
      {FUTURE.map((label) => (
        <span className="nav-disabled" key={label} title="后续 Sprint 交付">
          {label}
        </span>
      ))}
    </nav>
  );
}
