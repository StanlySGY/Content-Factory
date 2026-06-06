import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export const editorKeys = {
  state: (taskId: string) => ["editor", "state", taskId] as const,
};

export function useEditorState(taskId: string) {
  return useQuery({
    queryKey: editorKeys.state(taskId),
    queryFn: () => api.getEditorState(taskId),
    enabled: Boolean(taskId),
  });
}
