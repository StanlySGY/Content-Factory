import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useExecutionJobs() {
  return useQuery({
    queryKey: ["execution", "jobs", "ledger"],
    queryFn: () => api.listExecutionJobs({}),
  });
}

export function useExecutionJobResults(jobId: string | undefined) {
  return useQuery({
    queryKey: ["execution", "jobs", jobId, "results"],
    enabled: Boolean(jobId),
    queryFn: () => {
      if (!jobId) throw new Error("execution job id is required");
      return api.listExecutionJobResults(jobId);
    },
  });
}

export function useExecutionResultSummary(jobId: string | undefined) {
  return useQuery({
    queryKey: ["execution", "jobs", jobId, "result-summary"],
    enabled: Boolean(jobId),
    queryFn: () => {
      if (!jobId) throw new Error("execution job id is required");
      return api.getExecutionResultSummary(jobId);
    },
  });
}
