import { describe, expect, it } from "vitest";
import { EnvRuntimeCredentialResolver } from "../../src/application/runtime/credential-resolver.js";

describe("EnvRuntimeCredentialResolver", () => {
  it("resolves env:// credential refs without exposing material in metadata", async () => {
    const resolver = new EnvRuntimeCredentialResolver({ CONTENT_FACTORY_OPENAI_KEY: "sk-productization-test" });

    const resolved = await resolver.resolve({
      provider: "openai_compatible",
      keyRef: "env://CONTENT_FACTORY_OPENAI_KEY",
      scope: "project",
    });

    expect(resolved).toMatchObject({
      provider: "openai_compatible",
      keyRef: "env://CONTENT_FACTORY_OPENAI_KEY",
      scope: "project",
      resolved: true,
      material: "sk-productization-test",
      metadata: {
        resolver_kind: "env",
        key_ref_scheme: "env://",
        secret_material_returned_to_transport: true,
      },
    });
    expect(JSON.stringify(resolved.metadata)).not.toContain("sk-productization-test");
  });

  it("fails closed for missing env values and non-env refs", async () => {
    const resolver = new EnvRuntimeCredentialResolver({});

    await expect(resolver.resolve({
      provider: "openai_compatible",
      keyRef: "env://MISSING_OPENAI_KEY",
      scope: "project",
    })).resolves.toMatchObject({
      resolved: false,
      material: undefined,
      metadata: { resolver_kind: "env", failure_reason: "missing_env_var" },
    });

    await expect(resolver.resolve({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai",
      scope: "project",
    })).resolves.toMatchObject({
      resolved: false,
      material: undefined,
      metadata: { resolver_kind: "env", failure_reason: "unsupported_key_ref_scheme" },
    });
  });
});
