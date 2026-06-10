import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useExecutionOutboxJobs() {
  return useQuery({
    queryKey: ["execution", "jobs", "outbox-ledger"],
    queryFn: () => api.listExecutionJobs({}),
  });
}

export function useExecutionJobEvents(jobId: string | undefined) {
  return useQuery({
    queryKey: ["execution", "jobs", jobId, "events"],
    enabled: Boolean(jobId),
    queryFn: () => {
      if (!jobId) throw new Error("execution job id is required");
      return api.listExecutionJobEvents(jobId);
    },
  });
}
