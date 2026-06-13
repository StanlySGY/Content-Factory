import { Link } from "react-router-dom";

interface TopBarProps {
  onMenuToggle?: () => void;
}

export function TopBar({ onMenuToggle }: TopBarProps = {}) {
  return (
    <header className="topbar">
      {/* 移动端汉堡菜单 */}
      <button
        className="mobile-menu-btn"
        onClick={onMenuToggle}
        aria-label="打开菜单"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="crumbs">
        项目：<strong>Default Project</strong>
      </div>
      <Link className="btn primary" to="/tasks/create">
        + 新建文章
      </Link>
    </header>
  );
}
