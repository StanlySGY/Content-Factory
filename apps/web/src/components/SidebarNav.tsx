import { NavLink } from "react-router-dom";

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
      <NavLink to="/execution/results">执行结果</NavLink>
      <NavLink to="/execution/outbox">出箱事件</NavLink>
      <NavLink to="/execution/writebacks">回写账本</NavLink>
      <NavLink to="/evaluations">评估看板</NavLink>
      <NavLink to="/assets">素材中心</NavLink>
      <NavLink end to="/knowledge">知识库</NavLink>
      <NavLink to="/knowledge/candidates">知识候选</NavLink>
      <NavLink end to="/mcp">MCP 管理</NavLink>
      <NavLink to="/mcp/invocations">MCP 调用</NavLink>
      <NavLink to="/mcp/marketplace">MCP 市场</NavLink>
      <NavLink to="/rbac">RBAC 管理</NavLink>
      <NavLink to="/publisher">发布工作台</NavLink>
      <NavLink to="/ops/readiness">运维门禁</NavLink>
      <NavLink to="/ops/monitoring">运维监控</NavLink>
      <NavLink to="/ops/provider-quota">额度成本</NavLink>
      <NavLink to="/ops/agent-provider-config">Provider 配置</NavLink>
      <NavLink to="/ops/agent-provider-transport">Provider 传输</NavLink>
      <NavLink to="/ops/agent-registration-guard">Agent 注册门禁</NavLink>
      <NavLink to="/ops/secret-injection">Secret 注入</NavLink>
    </nav>
  );
}
