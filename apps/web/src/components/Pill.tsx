// 通用状态徽章（复用 styles.css .badge 色调；S2 状态集，文本+色 ui §21）
export type Tone = "neutral" | "info" | "running" | "success" | "danger";

const TONES: Record<string, Tone> = {
  active: "success",
  draft: "info",
  deprecated: "neutral",
  pending: "info",
  running: "running",
  completed: "success",
  failed: "danger",
  terminated: "neutral",
  archived: "neutral",
  waiting_review: "info",
  approved: "success",
  skipped: "neutral",
};

export function statusTone(s: string): Tone {
  return TONES[s] ?? "neutral";
}

export function Pill({ text, tone }: { text: string; tone?: Tone }) {
  return (
    <span className={`badge ${tone ?? statusTone(text)}`} aria-label={`状态 ${text}`}>
      {text.toUpperCase()}
    </span>
  );
}
