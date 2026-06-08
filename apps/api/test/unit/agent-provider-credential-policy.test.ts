import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  assertNoInlineCredentialMaterial,
  buildCredentialResolutionSnapshot,
  validateAgentCredentialRef,
} from "../../src/application/runtime/agent-provider-credential-policy.js";

describe("Agent provider credential policy", () => {
  it("accepts only credential references and rejects inline material", () => {
    expect(() => validateAgentCredentialRef({ provider: "openai", keyRef: "secret://llm/openai", scope: "project" })).not.toThrow();
    expect(() => validateAgentCredentialRef({ provider: "openai", keyRef: "vault://llm/openai", scope: "workspace" })).not.toThrow();
    expect(() => validateAgentCredentialRef({ provider: "openai", keyRef: "env://OPENAI_KEY", scope: "system" })).not.toThrow();
    expect(() => validateAgentCredentialRef({ provider: "openai", keyRef: "sk-live-secret", scope: "project" })).toThrow(ValidationError);
  });

  it("detects inline secret-like material in arbitrary snapshots", () => {
    expect(() => assertNoInlineCredentialMaterial({ nested: { token: "secret-value" } })).toThrow(ValidationError);
    expect(() => assertNoInlineCredentialMaterial({ nested: { key_ref: "secret://safe/ref" } })).not.toThrow();
  });

  it("builds a resolver snapshot without secret material", () => {
    const snapshot = buildCredentialResolutionSnapshot({
      provider: "openai",
      keyRef: "secret://llm/openai",
      scope: "project",
    });

    expect(snapshot).toEqual({
      provider: "openai",
      keyRef: "secret://llm/openai",
      scope: "project",
      resolved: false,
      secretMaterialPresent: false,
      metadata: { resolver: "mock", phase: "preflight" },
    });
    expect(JSON.stringify(snapshot)).not.toContain("sk-");
  });
});
