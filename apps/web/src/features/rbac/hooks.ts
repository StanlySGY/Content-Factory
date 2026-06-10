import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddOrganizationMemberBody, GrantProjectMembershipBody, UpdateOrganizationMemberBody } from "@cf/shared";
import { api } from "../../lib/api.js";

const rbacKey = ["rbac"];

export function useRbacOrganizations() {
  return useQuery({
    queryKey: [...rbacKey, "organizations"],
    queryFn: () => api.listRbacOrganizations(),
  });
}

export function useRbacOrganizationMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...rbacKey, "organizations", organizationId, "members"],
    enabled: Boolean(organizationId),
    queryFn: () => {
      if (!organizationId) throw new Error("organization id is required");
      return api.listRbacOrganizationMembers(organizationId);
    },
  });
}

export function useRbacProjectMemberships(projectId: string) {
  return useQuery({
    queryKey: [...rbacKey, "projects", projectId, "memberships"],
    queryFn: () => api.listRbacProjectMemberships(projectId),
  });
}

export function useAddRbacOrganizationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, body }: { organizationId: string; body: AddOrganizationMemberBody }) =>
      api.addRbacOrganizationMember(organizationId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKey }),
  });
}

export function useUpdateRbacOrganizationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrganizationMemberBody }) =>
      api.updateRbacOrganizationMember(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKey }),
  });
}

export function useDeactivateRbacOrganizationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deactivateRbacOrganizationMember(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKey }),
  });
}

export function useGrantRbacProjectMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: GrantProjectMembershipBody }) =>
      api.grantRbacProjectMembership(projectId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKey }),
  });
}

export function useRevokeRbacProjectMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeRbacProjectMembership(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKey }),
  });
}
