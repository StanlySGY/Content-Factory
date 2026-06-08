import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import { MockCredentialResolver } from "../../src/application/runtime/credential-resolver.js";

describe("MockCredentialResolver", () => {
  it("resolves credential references without returning secret values", async () => {
    const resolver = new MockCredentialResolver();
    const resolved = await resolver.resolve({ provider: "openai", keyRef: "secret://llm/openai", scope: "project" });

    expect(resolved).toEqual({
      provider: "openai",
      scope: "project",
      keyRef: "secret://llm/openai",
      resolved: false,
      metadata: { mock: true },
    });
    expect(JSON.stringify(resolved).toLowerCase()).not.toContain("token");
    expect(JSON.stringify(resolved).toLowerCase()).not.toContain("api_key");
    expect(JSON.stringify(resolved).toLowerCase()).not.toContain("password");
    expect(JSON.stringify(resolved).toLowerCase()).not.toContain("authorization");
  });

  it("rejects inline secret-like values", async () => {
    const resolver = new MockCredentialResolver();

    await expect(resolver.resolve({ provider: "openai", keyRef: "sk-live-secret", scope: "project" })).rejects.toThrow(
      ValidationError,
    );
  });
});
