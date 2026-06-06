import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentSessionStatus,
  CreateAgentProfileBody,
  UpdateAgentProfileBody,
} from "@cf/shared";
import { api } from "../../lib/api.js";

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string) => ["agents", "detail", id] as const,
  sessions: (id: string) => ["agents", "sessions", id] as const,
  session: (id: string) => ["agent-sessions", id] as const,
};

export function useAgents() {
  return useQuery({ queryKey: agentKeys.all, queryFn: () => api.listAgents() });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => api.getAgent(id),
    enabled: Boolean(id),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateAgentProfileBody) => api.createAgent(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateAgentProfileBody) => api.updateAgent(id, b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.all });
      void qc.invalidateQueries({ queryKey: agentKeys.detail(id) });
    },
  });
}

export function useHealthCheckAgent(id: string) {
  return useMutation({ mutationFn: () => api.healthCheckAgent(id) });
}

export function useAgentSessions(id: string) {
  return useQuery({
    queryKey: agentKeys.sessions(id),
    queryFn: () => api.listAgentSessions(id),
    enabled: Boolean(id),
  });
}

export function useCreateMockSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: AgentSessionStatus) => api.createMockSession(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.sessions(id) }),
  });
}

export function useAgentSession(id: string) {
  return useQuery({
    queryKey: agentKeys.session(id),
    queryFn: () => api.getAgentSession(id),
    enabled: Boolean(id),
  });
}
