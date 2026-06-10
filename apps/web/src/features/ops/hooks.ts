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

export function useOpsMonitoringReadiness() {
  return useQuery({
    queryKey: ["ops", "monitoring-readiness"],
    queryFn: async () => {
      const [monitoring, stagingSmoke] = await Promise.all([
        api.getExecutionMonitoringReadiness(),
        api.getStagingSmokeReadiness(),
      ]);

      return { monitoring, stagingSmoke };
    },
  });
}

export function useProviderQuotaCostPreflight() {
  return useQuery({
    queryKey: ["ops", "provider-quota-cost-preflight"],
    queryFn: () => api.getProviderQuotaCostPreflight(),
  });
}

export function useAgentRealProviderConfigPreflight() {
  return useQuery({
    queryKey: ["ops", "agent-real-provider-config-preflight"],
    queryFn: () => api.getAgentRealProviderConfigPreflight(),
  });
}
