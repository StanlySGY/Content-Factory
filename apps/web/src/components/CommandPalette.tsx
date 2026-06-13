import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

interface RouteItem {
  path: string;
  label: string;
  icon: string;
  keywords?: string[];
}

const routes: RouteItem[] = [
  { path: "/dashboard", label: "工作台", icon: "📊" },
  { path: "/tasks", label: "任务列表", icon: "📝", keywords: ["task", "任务"] },
  { path: "/tasks/new", label: "创建任务", icon: "➕", keywords: ["new", "create", "新建"] },
  { path: "/workflows", label: "工作流", icon: "🔄", keywords: ["workflow", "流程"] },
  { path: "/assets", label: "素材中心", icon: "🎨", keywords: ["asset", "素材"] },
  { path: "/settings/agents", label: "Agent 管理", icon: "🤖", keywords: ["agent"] },
  { path: "/settings/knowledge", label: "知识库", icon: "📚", keywords: ["knowledge", "知识"] },
  { path: "/settings/mcp", label: "MCP 工具", icon: "🔧", keywords: ["mcp", "tool"] },
  { path: "/settings/workflows", label: "工作流模板", icon: "📋", keywords: ["template", "模板"] },
  { path: "/admin/reviews", label: "审核队列", icon: "✅", keywords: ["review", "审核"] },
  { path: "/admin/work-queue", label: "工作队列", icon: "📥", keywords: ["queue", "队列"] },
  { path: "/admin/execution", label: "执行日志", icon: "📊", keywords: ["execution", "log", "日志"] },
  { path: "/admin/evaluations", label: "评估看板", icon: "📈", keywords: ["evaluation", "评估"] },
  { path: "/admin/mcp", label: "MCP 管理", icon: "🔧", keywords: ["mcp", "管理"] },
  { path: "/admin/rbac", label: "权限管理", icon: "🔐", keywords: ["rbac", "permission", "权限"] },
  { path: "/admin/publisher", label: "发布工作台", icon: "🚀", keywords: ["publish", "发布"] },
  { path: "/admin/ops", label: "运维看板", icon: "⚙️", keywords: ["ops", "运维"] },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredRoutes = routes.filter((route) => {
    const searchLower = search.toLowerCase();
    return (
      route.label.toLowerCase().includes(searchLower) ||
      route.path.toLowerCase().includes(searchLower) ||
      route.keywords?.some((kw) => kw.toLowerCase().includes(searchLower))
    );
  });

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredRoutes.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filteredRoutes[selectedIndex]) {
      e.preventDefault();
      navigate(filteredRoutes[selectedIndex].path);
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="palette-overlay" onClick={onClose} />
      <div className="command-palette">
        <div className="palette-header">
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索页面..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="palette-input"
          />
        </div>
        <div className="palette-results">
          {filteredRoutes.length === 0 ? (
            <div className="palette-empty">未找到匹配的页面</div>
          ) : (
            filteredRoutes.map((route, index) => (
              <button
                key={route.path}
                className={`palette-item ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => handleSelect(route.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="palette-icon">{route.icon}</span>
                <span className="palette-label">{route.label}</span>
                <span className="palette-path">{route.path}</span>
              </button>
            ))
          )}
        </div>
        <div className="palette-footer">
          <kbd>↑↓</kbd> 导航 · <kbd>Enter</kbd> 选择 · <kbd>Esc</kbd> 关闭
        </div>
      </div>
    </>
  );
}
