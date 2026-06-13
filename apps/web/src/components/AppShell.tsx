import type { ReactNode } from "react";
import { Breadcrumb } from "./Breadcrumb.js";
import { SidebarNav } from "./SidebarNav.js";
import { TopBar } from "./TopBar.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <SidebarNav />
      <div className="main">
        <TopBar />
        <Breadcrumb />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
