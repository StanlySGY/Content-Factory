import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWorkflowBody, ListWorkflowsQuery } from "@cf/shared";
import { api } from "../../lib/api.js";

export const workflowKeys = {
  all: ["workflows"] as const,
  list: (q: ListWorkflowsQuery) => ["workflows", "list", q] as const,
  detail: (id: string) => ["workflows", "detail", id] as const,
};

export function useWorkflows(q: ListWorkflowsQuery) {
  return useQuery({ queryKey: workflowKeys.list(q), queryFn: () => api.listWorkflows(q) });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () => api.getWorkflow(id),
    enabled: Boolean(id),
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateWorkflowBody) => api.createWorkflow(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowKeys.all }),
  });
}

export function useActivateWorkflow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.activateWorkflow(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workflowKeys.all });
      void qc.invalidateQueries({ queryKey: workflowKeys.detail(id) });
    },
  });
}
