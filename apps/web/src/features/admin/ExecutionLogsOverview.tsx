import { Link } from "react-router-dom";
import "../admin/admin.css";

export function ExecutionLogsOverview() {
  return (
    <div>
      <div className="page-head">
        <h1>执行日志</h1>
        <p>查看系统执行记录和追踪</p>
      </div>

      <div className="admin-grid">
        <Link to="/admin/execution/results" className="admin-card">
          <div className="admin-card-icon">✅</div>
          <h3>执行结果</h3>
          <p>查看 Agent 执行结果记录</p>
        </Link>

        <Link to="/admin/execution/outbox" className="admin-card">
          <div className="admin-card-icon">📤</div>
          <h3>Outbox 账本</h3>
          <p>查看待发送的外部消息</p>
        </Link>

        <Link to="/admin/execution/writebacks" className="admin-card">
          <div className="admin-card-icon">✍️</div>
          <h3>Writeback 账本</h3>
          <p>查看写回操作记录</p>
        </Link>
      </div>

      <div style={{ marginTop: 40 }}>
        <h2 className="section-title">最近执行记录</h2>
        <div className="info-hint">
          <p>📊 执行记录摘要功能开发中</p>
          <p>请点击上方卡片查看详细日志</p>
        </div>
      </div>
    </div>
  );
}
