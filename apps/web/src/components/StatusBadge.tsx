import { TASK_STATUS_BADGE, type TaskStatus } from "@cf/shared";

export function StatusBadge({ status }: { status: TaskStatus }) {
  const b =
    TASK_STATUS_BADGE[status] ?? { label: String(status).toUpperCase(), tone: "neutral" as const };
  return (
    <span className={`badge ${b.tone}`} aria-label={`状态 ${b.label}`}>
      {b.label}
    </span>
  );
}
