import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { api } from "../../lib/api.js";

const mcpMarketplaceDashboardKey = ["mcp", "marketplace", "dashboard", DEFAULT_PROJECT_ID];

export function useMcpMarketplaceDashboard() {
  return useQuery({
    queryKey: mcpMarketplaceDashboardKey,
    queryFn: async () => {
      const [entries, installations, servers] = await Promise.all([
        api.listMcpMarketplaceEntries(),
        api.listMcpMarketplaceInstallations(DEFAULT_PROJECT_ID),
        api.listMcpServers(),
      ]);

      return { entries, installations, servers };
    },
  });
}

export function useInstallMcpMarketplaceEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => api.installMcpMarketplaceEntry(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpMarketplaceDashboardKey }),
  });
}

export function useDisableMcpMarketplaceInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.disableMcpMarketplaceInstallation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpMarketplaceDashboardKey }),
  });
}

export function useUninstallMcpMarketplaceInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.uninstallMcpMarketplaceInstallation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpMarketplaceDashboardKey }),
  });
}
