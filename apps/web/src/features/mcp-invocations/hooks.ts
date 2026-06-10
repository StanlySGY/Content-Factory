import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useMcpInvocationServers() {
  return useQuery({
    queryKey: ["mcp", "invocations", "servers"],
    queryFn: () => api.listMcpServers(),
  });
}

export function useMcpInvocationTools(serverId: string | undefined) {
  return useQuery({
    queryKey: ["mcp", "invocations", "servers", serverId, "tools"],
    enabled: Boolean(serverId),
    queryFn: () => {
      if (!serverId) throw new Error("mcp server id is required");
      return api.listMcpTools(serverId);
    },
  });
}

export function useToolInvocations(toolId: string | undefined) {
  return useQuery({
    queryKey: ["mcp", "invocations", "tools", toolId],
    enabled: Boolean(toolId),
    queryFn: () => {
      if (!toolId) throw new Error("mcp tool id is required");
      return api.listToolInvocations(toolId);
    },
  });
}
