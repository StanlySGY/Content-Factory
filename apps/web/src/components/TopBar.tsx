import { Link } from "react-router-dom";

export function TopBar() {
  return (
    <header className="topbar">
      <div className="crumbs">
        项目：<strong>Default Project</strong>
      </div>
      <Link className="btn primary" to="/content/tasks/new">
        + 新建任务
      </Link>
    </header>
  );
}
