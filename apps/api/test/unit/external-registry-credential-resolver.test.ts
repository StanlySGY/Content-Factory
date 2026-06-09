import { describe, expect, it } from "vitest";
import {
  ExternalRegistryCredentialResolver,
  parseExternalSecretRegistry,
  validateExternalSecretRegistryEntry,
} from "../../src/application/runtime/credential-resolver.js";

describe("external secret registry contract", () => {
  it("parses secret and vault refs mapped to env material sources", () => {
    const entries = parseExternalSecretRegistry([
      "secret://llm/openai=env://CONTENT_FACTORY_OPENAI_KEY",
      "vault://team/service/key=env://CONTENT_FACTORY_VAULT_BACKED_KEY",
    ]);

    expect(entries).toEqual([
      {
        keyRef: "secret://llm/openai",
        materialSourceRef: "env://CONTENT_FACTORY_OPENAI_KEY",
        materialEnvName: "CONTENT_FACTORY_OPENAI_KEY",
      },
      {
        keyRef: "vault://team/service/key",
        materialSourceRef: "env://CONTENT_FACTORY_VAULT_BACKED_KEY",
        materialEnvName: "CONTENT_FACTORY_VAULT_BACKED_KEY",
      },
    ]);
  });

  it("rejects unsupported refs and inline secret-like values", () => {
    expect(() => validateExternalSecretRegistryEntry("env://CONTENT_FACTORY_OPENAI_KEY=env://SOURCE")).toThrow(
      /external secret registry key ref must use secret:\/\/ or vault:\/\//,
    );
    expect(() => validateExternalSecretRegistryEntry("secret://llm/openai=literal-token")).toThrow(
      /must map to env:\/\/ENV_NAME/,
    );
    expect(() => validateExternalSecretRegistryEntry("secret://llm/openai=Bearer inline-token")).toThrow(
      /inline secret material is not allowed/,
    );
  });
});

describe("ExternalRegistryCredentialResolver", () => {
  it("resolves registered secret refs through env material at the transport boundary", async () => {
    const resolver = new ExternalRegistryCredentialResolver(
      { CONTENT_FACTORY_OPENAI_KEY: "sk-p1-1-contract" },
      ["secret://llm/openai=env://CONTENT_FACTORY_OPENAI_KEY"],
    );

    const resolved = await resolver.resolve({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai",
      scope: "project",
    });

    expect(resolved).toMatchObject({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai",
      scope: "project",
      resolved: true,
      material: "sk-p1-1-contract",
      metadata: {
        resolver_kind: "external_registry",
        key_ref_scheme: "secret://",
        material_source_scheme: "env://",
        material_env_name: "CONTENT_FACTORY_OPENAI_KEY",
        secret_material_present: true,
        secret_material_returned_to_transport: true,
        network_used: false,
        process_spawned: false,
      },
    });
    expect(JSON.stringify(resolved.metadata)).not.toContain("sk-p1-1-contract");
  });

  it("fails closed for unregistered refs, missing env material and unsupported schemes", async () => {
    const resolver = new ExternalRegistryCredentialResolver(
      {},
      ["secret://llm/openai=env://CONTENT_FACTORY_OPENAI_KEY"],
    );

    await expect(resolver.resolve({
      provider: "openai_compatible",
      keyRef: "secret://llm/missing",
      scope: "project",
    })).resolves.toMatchObject({
      resolved: false,
      material: undefined,
      metadata: { resolver_kind: "external_registry", failure_reason: "key_ref_not_registered" },
    });

    await expect(resolver.resolve({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai",
      scope: "project",
    })).resolves.toMatchObject({
      resolved: false,
      material: undefined,
      metadata: { resolver_kind: "external_registry", failure_reason: "missing_env_var" },
    });

    await expect(resolver.resolve({
      provider: "openai_compatible",
      keyRef: "env://CONTENT_FACTORY_OPENAI_KEY",
      scope: "project",
    })).resolves.toMatchObject({
      resolved: false,
      material: undefined,
      metadata: { resolver_kind: "external_registry", failure_reason: "unsupported_key_ref_scheme" },
    });
  });
});
