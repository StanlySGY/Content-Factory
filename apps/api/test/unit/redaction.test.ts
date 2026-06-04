import { describe, expect, it } from "vitest";
import { redactObject } from "../../src/application/redaction.service.js";

describe("redactObject (ADR-012 脱敏管道)", () => {
  it("masks sensitive keys recursively", () => {
    const out = redactObject({
      a: 1,
      password: "p",
      nested: { api_key: "k", ok: "v", authToken: "t" },
      list: [{ token: "t" }, { plain: "x" }],
    }) as Record<string, any>;
    expect(out.a).toBe(1);
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.api_key).toBe("[REDACTED]");
    expect(out.nested.authToken).toBe("[REDACTED]");
    expect(out.nested.ok).toBe("v");
    expect(out.list[0].token).toBe("[REDACTED]");
    expect(out.list[1].plain).toBe("x");
  });

  it("returns null for null", () => {
    expect(redactObject(null)).toBeNull();
  });

  it("passes through non-sensitive payload unchanged", () => {
    const input = { title: "hello", status: "draft", n: 3 };
    expect(redactObject(input)).toEqual(input);
  });
});
