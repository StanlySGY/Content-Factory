import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useExecutionWritebackJobs() {
  return useQuery({
    queryKey: ["execution", "jobs", "writeback-ledger"],
    queryFn: () => api.listExecutionJobs({}),
  });
}

export function useExecutionWritebackJobResults(jobId: string | undefined) {
  return useQuery({
    queryKey: ["execution", "jobs", jobId, "writeback-results"],
    enabled: Boolean(jobId),
    queryFn: () => {
      if (!jobId) throw new Error("execution job id is required");
      return api.listExecutionJobResults(jobId);
    },
  });
}

export function useExecutionResultWritebacks(resultId: string | undefined) {
  return useQuery({
    queryKey: ["execution", "results", resultId, "writebacks"],
    enabled: Boolean(resultId),
    queryFn: () => {
      if (!resultId) throw new Error("execution result id is required");
      return api.listExecutionResultWritebacks(resultId);
    },
  });
}
