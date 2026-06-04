import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { CreateTaskBody, ListTasksQuery, UpdateTaskBody } from "@cf/shared";
import { api } from "../../lib/api.js";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (q: ListTasksQuery) => ["tasks", "list", q] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
  audit: (id: string) => ["tasks", "audit", id] as const,
};

export function useTasks(q: ListTasksQuery) {
  return useQuery({ queryKey: taskKeys.list(q), queryFn: () => api.listTasks(q) });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => api.getTask(id),
    enabled: Boolean(id),
  });
}

export function useAuditTrail(id: string) {
  return useQuery({
    queryKey: taskKeys.audit(id),
    queryFn: () => api.auditTrail(id),
    enabled: Boolean(id),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateTaskBody) => api.createTask(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateTaskBody) => api.updateTask(id, b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
      void qc.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: taskKeys.audit(id) });
    },
  });
}
