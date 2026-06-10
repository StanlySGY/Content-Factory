import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useKnowledgeSources() {
  return useQuery({
    queryKey: ["knowledge", "sources"],
    queryFn: () => api.listKnowledgeSources({}),
  });
}

export function useKnowledgeSourceInventory(sourceId: string | undefined) {
  return useQuery({
    queryKey: ["knowledge", "source", sourceId, "inventory"],
    enabled: Boolean(sourceId),
    queryFn: async () => {
      if (!sourceId) throw new Error("knowledge source id is required");

      const [source, entries] = await Promise.all([
        api.getKnowledgeSource(sourceId),
        api.listKnowledgeEntries(sourceId, {}),
      ]);

      return { source, entries };
    },
  });
}
