import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useMcpServers() {
  return useQuery({
    queryKey: ["mcp", "servers"],
    queryFn: () => api.listMcpServers(),
  });
}

export function useMcpTools(serverId: string | undefined) {
  return useQuery({
    queryKey: ["mcp", "servers", serverId, "tools"],
    enabled: Boolean(serverId),
    queryFn: () => {
      if (!serverId) throw new Error("mcp server id is required");
      return api.listMcpTools(serverId);
    },
  });
}

export function useMcpRealRuntimeReadiness() {
  return useQuery({
    queryKey: ["mcp", "real-runtime-readiness"],
    queryFn: () => api.getMcpRealRuntimeReadiness(),
  });
}
