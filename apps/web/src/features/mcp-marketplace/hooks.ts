import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { api } from "../../lib/api.js";

export function useMcpMarketplaceDashboard() {
  return useQuery({
    queryKey: ["mcp", "marketplace", "dashboard", DEFAULT_PROJECT_ID],
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
