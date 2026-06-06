import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAssetBody, CreateAssetVersionBody } from "@cf/shared";
import { api } from "../../lib/api.js";

export const assetKeys = {
  detail: (id: string) => ["assets", "detail", id] as const,
  versions: (id: string) => ["assets", "versions", id] as const,
};

export function useAsset(id: string) {
  return useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: () => api.getAsset(id),
    enabled: Boolean(id),
  });
}

export function useAssetVersions(id: string) {
  return useQuery({
    queryKey: assetKeys.versions(id),
    queryFn: () => api.listAssetVersions(id),
    enabled: Boolean(id),
  });
}

export function useCreateAsset() {
  return useMutation({ mutationFn: (b: CreateAssetBody) => api.createAsset(b) });
}

function invalidateAsset(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: assetKeys.detail(id) });
  void qc.invalidateQueries({ queryKey: assetKeys.versions(id) });
}

export function useCreateAssetVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateAssetVersionBody) => api.createAssetVersion(id, b),
    onSuccess: () => invalidateAsset(qc, id),
  });
}

export function usePublishAssetVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => api.publishAssetVersion(id, { version_id: versionId }),
    onSuccess: () => invalidateAsset(qc, id),
  });
}

export function useCompareAssetVersions(id: string, from: number, to: number, enabled: boolean) {
  return useQuery({
    queryKey: ["assets", "compare", id, from, to],
    queryFn: () => api.compareAssetVersions(id, from, to),
    enabled: enabled && Boolean(id),
  });
}
