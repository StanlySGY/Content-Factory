import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export const KNOWLEDGE_CANDIDATE_LIMIT = 5;

export function useKnowledgeCandidateTasks() {
  return useQuery({
    queryKey: ["knowledge", "candidates", "tasks", { page: 1, page_size: 20 }],
    queryFn: () => api.listTasks({ page: 1, page_size: 20 }),
  });
}

export function useTaskKnowledgeCandidateReview(
  taskId: string | undefined,
  query: string | undefined,
) {
  return useQuery({
    queryKey: ["knowledge", "candidates", "task", taskId, query, KNOWLEDGE_CANDIDATE_LIMIT],
    enabled: Boolean(taskId && query),
    queryFn: async () => {
      if (!taskId || !query) throw new Error("task id and candidate query are required");

      const [candidates, contextPacks] = await Promise.all([
        api.listTaskKnowledgeCandidates(taskId, { q: query, limit: KNOWLEDGE_CANDIDATE_LIMIT }),
        api.listContextPacks(taskId),
      ]);

      return { candidates, contextPacks };
    },
  });
}
