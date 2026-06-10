import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useFinalRcReadiness() {
  return useQuery({
    queryKey: ["ops", "final-rc-readiness"],
    queryFn: () => api.getFinalRcReadiness(),
  });
}

export function useReadinessDrilldowns(enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "readiness-drilldowns"],
    enabled,
    queryFn: async () => {
      const [
        productionActivation,
        productionReadinessP1,
        mcpRealRuntime,
        publisherRealRuntime,
        writebackExecutorRegistration,
      ] = await Promise.all([
        api.getProductionActivationReadiness(),
        api.getProductionReadinessP1(),
        api.getMcpRealRuntimeReadiness(),
        api.getPublisherRealRuntimeReadiness(),
        api.getWritebackExecutorRegistrationReadiness(),
      ]);

      return {
        productionActivation,
        productionReadinessP1,
        mcpRealRuntime,
        publisherRealRuntime,
        writebackExecutorRegistration,
      };
    },
  });
}
