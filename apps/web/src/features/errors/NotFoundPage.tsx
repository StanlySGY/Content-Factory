import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="container" style={{ textAlign: "center", paddingTop: "8rem" }}>
      <div style={{ fontSize: "6rem", fontWeight: "bold", color: "var(--color-muted)" }}>
        404
      </div>
      <h1 style={{ marginTop: "var(--sp-4)", marginBottom: "var(--sp-2)" }}>
        页面不存在
      </h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "var(--sp-6)" }}>
        您访问的页面不存在或已被移除
      </p>
      <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center" }}>
        <Link to="/dashboard" className="button">
          返回工作台
        </Link>
        <Link to="/tasks" className="button button-secondary">
          查看任务
        </Link>
      </div>
    </div>
  );
}
