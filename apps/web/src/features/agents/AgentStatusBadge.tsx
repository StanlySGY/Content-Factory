import type { AgentProfileDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";

// Agent 状态徽章（复用 Pill 色调；active=success，disabled/archived=neutral）
export function AgentStatusBadge({ status }: { status: AgentProfileDTO["status"] }) {
  return <Pill text={status} />;
}
