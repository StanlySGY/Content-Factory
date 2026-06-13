import type { ReactNode } from "react";
import { Breadcrumb } from "./Breadcrumb.js";
import { CommandPalette } from "./CommandPalette.js";
import { SidebarNav } from "./SidebarNav.js";
import { TopBar } from "./TopBar.js";
import { useCommandPalette } from "../hooks/useCommandPalette.js";

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, close } = useCommandPalette();

  return (
    <div className="shell">
      <SidebarNav />
      <div className="main">
        <TopBar />
        <Breadcrumb />
        <div className="content">{children}</div>
      </div>
      <CommandPalette isOpen={isOpen} onClose={close} />
    </div>
  );
}
