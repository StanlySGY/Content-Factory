import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useFinalRcReadiness() {
  return useQuery({
    queryKey: ["ops", "final-rc-readiness"],
    queryFn: () => api.getFinalRcReadiness(),
  });
}
