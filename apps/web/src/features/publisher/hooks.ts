import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePublisherChannelBody, ResendPublishRecordBody, UpdatePublisherChannelBody, PublishVersionBody } from "@cf/shared";
import { api } from "../../lib/api.js";

const publisherWorkbenchKey = ["publisher", "workbench"];
const publisherChannelsKey = ["publisher", "channels"];

export function usePublisherWorkbench() {
  return useQuery({
    queryKey: publisherWorkbenchKey,
    queryFn: async () => {
      const [channels, records] = await Promise.all([
        api.listPublisherChannels(),
        api.listPublishRecords(),
      ]);

      return { channels, records };
    },
  });
}

export function usePublisherChannels() {
  return useQuery({
    queryKey: publisherChannelsKey,
    queryFn: () => api.listPublisherChannels(),
  });
}

export function useCreatePublisherChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePublisherChannelBody) => api.createPublisherChannel(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey }),
  });
}

export function useUpdatePublisherChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePublisherChannelBody }) =>
      api.updatePublisherChannel(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey }),
  });
}

export function useDisablePublisherChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.disablePublisherChannel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey }),
  });
}

export function useArchivePublisherChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archivePublisherChannel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey }),
  });
}

export function useWithdrawPublishRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.withdrawPublishRecord(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey }),
  });
}

export function useResendPublishRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResendPublishRecordBody }) =>
      api.resendPublishRecord(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey }),
  });
}

export function usePublishVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, body }: { assetId: string; body: PublishVersionBody }) =>
      api.publishAssetVersion(assetId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publisherWorkbenchKey });
      void queryClient.invalidateQueries({ queryKey: publisherChannelsKey });
    },
  });
}
