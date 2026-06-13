import { useEffect, useState } from "react";

export interface BadgeCounts {
  pendingReviews: number;
  runningTasks: number;
  workQueue: number;
}

const POLL_INTERVAL = 30000; // 30 秒轮询一次
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function useBadgeCounts(projectId: string = "00000000-0000-0000-0000-000000000001") {
  const [counts, setCounts] = useState<BadgeCounts>({
    pendingReviews: 0,
    runningTasks: 0,
    workQueue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        // 并行请求 summary 和 work-queue
        const [summaryRes, queueRes] = await Promise.all([
          fetch(`${API_BASE}/api/dashboard/summary?projectId=${projectId}`),
          fetch(`${API_BASE}/api/dashboard/work-queue?projectId=${projectId}`),
        ]);

        if (!summaryRes.ok || !queueRes.ok) {
          throw new Error("Failed to fetch badge counts");
        }

        const summary = await summaryRes.json();
        const queue = await queueRes.json();

        setCounts({
          pendingReviews: summary.pendingReviews ?? 0,
          runningTasks: 0, // TODO: 需要后端添加 running tasks 统计
          workQueue: queue.length ?? 0,
        });
      } catch (error) {
        console.error("Failed to fetch badge counts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [projectId]);

  return { counts, loading };
}
