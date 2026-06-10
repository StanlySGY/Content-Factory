import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function usePublisherWorkbench() {
  return useQuery({
    queryKey: ["publisher", "workbench"],
    queryFn: async () => {
      const [channels, records] = await Promise.all([
        api.listPublisherChannels(),
        api.listPublishRecords(),
      ]);

      return { channels, records };
    },
  });
}
