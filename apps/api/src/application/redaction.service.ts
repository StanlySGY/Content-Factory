// 统一脱敏管道（ADR-012）：强制管道，不依赖调用方自觉；写审计前剔除敏感键

const SENSITIVE_KEY =
  /(pass(word|wd)?|secret|token|api[_-]?key|authorization|auth|credential|cookie|session|private[_-]?key)/i;
const MASK = "[REDACTED]";

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? MASK : redactValue(v);
    }
    return out;
  }
  return value;
}

export function redactObject(
  o: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return o === null ? null : (redactValue(o) as Record<string, unknown>);
}
