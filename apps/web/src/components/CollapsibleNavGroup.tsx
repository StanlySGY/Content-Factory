import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

interface CollapsibleNavGroupProps {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  storageKey: string;
  children: ReactNode;
  pathPrefix: string;
}

export function CollapsibleNavGroup({
  title,
  icon = "▸",
  defaultOpen = false,
  storageKey,
  children,
  pathPrefix,
}: CollapsibleNavGroupProps) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === "true";
    return defaultOpen || location.pathname.startsWith(pathPrefix);
  });

  useEffect(() => {
    if (location.pathname.startsWith(pathPrefix)) {
      setIsOpen(true);
    }
  }, [location.pathname, pathPrefix]);

  useEffect(() => {
    localStorage.setItem(storageKey, String(isOpen));
  }, [isOpen, storageKey]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue !== null) {
        setIsOpen(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [storageKey]);

  return (
    <div className={`nav-group ${isOpen ? "open" : ""}`}>
      <div className="nav-group-header" onClick={() => setIsOpen(!isOpen)}>
        <span>{title}</span>
        <span className="nav-group-icon">{icon}</span>
      </div>
      {isOpen && <div className="nav-group-children">{children}</div>}
    </div>
  );
}
