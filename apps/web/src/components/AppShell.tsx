import type { ReactNode } from "react";
import { SidebarNav } from "./SidebarNav.js";
import { TopBar } from "./TopBar.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <SidebarNav />
      <div className="main">
        <TopBar />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
