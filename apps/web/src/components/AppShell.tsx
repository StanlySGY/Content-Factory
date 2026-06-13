import { useState } from "react";
import type { ReactNode } from "react";
import { Breadcrumb } from "./Breadcrumb.js";
import { CommandPalette } from "./CommandPalette.js";
import { SidebarNav } from "./SidebarNav.js";
import { TopBar } from "./TopBar.js";
import { useCommandPalette } from "../hooks/useCommandPalette.js";

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, close } = useCommandPalette();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="shell">
      {/* 移动端遮罩 */}
      {isMobileMenuOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <div className={`sidebar-wrapper ${isMobileMenuOpen ? "open" : ""}`}>
        <SidebarNav onNavigate={() => setIsMobileMenuOpen(false)} />
      </div>

      <div className="main">
        <TopBar onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
        <Breadcrumb />
        <div className="content">{children}</div>
      </div>
      <CommandPalette isOpen={isOpen} onClose={close} />
    </div>
  );
}
