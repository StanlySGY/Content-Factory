import { Link, useLocation } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  path: string;
}

const routeLabels: Record<string, string> = {
  dashboard: "工作台",
  tasks: "任务",
  workflows: "工作流",
  assets: "素材中心",
  settings: "设置",
  admin: "管理后台",
  content: "内容管理",
  agents: "Agent 运维",
  execution: "执行监控",
  system: "系统配置",
  ops: "运维看板",
  knowledge: "知识库",
  mcp: "MCP 工具",
  reviews: "审核队列",
  "work-queue": "工作队列",
  evaluations: "评估看板",
  rbac: "权限管理",
  publisher: "发布工作台",
  new: "新建",
  results: "执行结果",
  outbox: "发送队列",
  writebacks: "数据回写",
  readiness: "就绪检查",
  monitoring: "运行监控",
  invocations: "调用记录",
  marketplace: "工具市场",
  candidates: "候选项目",
  pending: "待审核",
  "product-routes": "产品路由",
  "provider-quota": "配额管理",
  "agent-provider-config": "Agent 配置",
  "agent-provider-transport": "传输配置",
  "provider-http-boundary": "HTTP 边界",
  "agent-registration-guard": "注册门禁",
  "agent-real-http-adapter": "HTTP 适配器",
  "secret-resolver": "密钥解析",
  "secret-injection": "密钥注入",
};

export function Breadcrumb() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  if (pathSegments.length === 0 || pathSegments[0] === "dashboard") {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = "";

  for (const segment of pathSegments) {
    currentPath += `/${segment}`;
    const label = routeLabels[segment] || segment;
    breadcrumbs.push({ label, path: currentPath });
  }

  return (
    <nav aria-label="面包屑导航" className="breadcrumb">
      <ol>
        <li>
          <Link to="/dashboard">首页</Link>
        </li>
        {breadcrumbs.map((crumb, index) => (
          <li key={crumb.path}>
            {index === breadcrumbs.length - 1 ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link to={crumb.path}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
