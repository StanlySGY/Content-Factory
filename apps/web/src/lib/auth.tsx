import { createContext, type ReactNode, useContext } from "react";

interface User {
  id: string;
  name: string;
  role: "admin" | "editor" | "viewer";
}

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // TODO: 实际项目中从 API 获取用户信息
  // 当前为演示，硬编码为 admin 角色
  const user: User = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Admin User",
    role: "admin",
  };

  const value: AuthContextValue = {
    user,
    isAdmin: user.role === "admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
