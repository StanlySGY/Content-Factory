import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useRbacOrganizations() {
  return useQuery({
    queryKey: ["rbac", "organizations"],
    queryFn: () => api.listRbacOrganizations(),
  });
}

export function useRbacOrganizationMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["rbac", "organizations", organizationId, "members"],
    enabled: Boolean(organizationId),
    queryFn: () => {
      if (!organizationId) throw new Error("organization id is required");
      return api.listRbacOrganizationMembers(organizationId);
    },
  });
}

export function useRbacProjectMemberships(projectId: string) {
  return useQuery({
    queryKey: ["rbac", "projects", projectId, "memberships"],
    queryFn: () => api.listRbacProjectMemberships(projectId),
  });
}
