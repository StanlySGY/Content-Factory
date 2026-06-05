import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateContextPackBody, UpdateContextPackBody } from "@cf/shared";
import { api } from "../../lib/api.js";

export const contextKeys = {
  byTask: (taskId: string) => ["context-packs", "task", taskId] as const,
};

export function useContextPacks(taskId: string) {
  return useQuery({
    queryKey: contextKeys.byTask(taskId),
    queryFn: () => api.listContextPacks(taskId),
    enabled: Boolean(taskId),
  });
}

export function useCreateContextPack(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateContextPackBody) => api.createContextPack(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: contextKeys.byTask(taskId) }),
  });
}

export function useUpdateContextPack(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContextPackBody }) =>
      api.updateContextPack(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: contextKeys.byTask(taskId) }),
  });
}
