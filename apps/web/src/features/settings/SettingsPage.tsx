import { Link } from "react-router-dom";
import "./settings.css";

export function SettingsPage() {
  return (
    <div>
      <div className="page-head">
        <h1>设置</h1>
        <p>配置系统功能和资源</p>
      </div>

      <div className="settings-grid">
        <Link to="/settings/agents" className="settings-card">
          <div className="settings-card-icon">🤖</div>
          <h3>Agent 管理</h3>
          <p>配置 AI Agent 实例和提供商</p>
        </Link>

        <Link to="/settings/knowledge" className="settings-card">
          <div className="settings-card-icon">📚</div>
          <h3>知识库</h3>
          <p>管理项目知识和上下文包</p>
        </Link>

        <Link to="/settings/mcp" className="settings-card">
          <div className="settings-card-icon">🔌</div>
          <h3>MCP 工具</h3>
          <p>工具集成和服务器配置</p>
        </Link>

        <Link to="/settings/workflows" className="settings-card">
          <div className="settings-card-icon">🔄</div>
          <h3>工作流模板</h3>
          <p>查看和管理工作流定义</p>
        </Link>
      </div>
    </div>
  );
}
