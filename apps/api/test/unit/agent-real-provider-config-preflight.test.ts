import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildAgentRealProviderConfigPreflight,
  validateAgentRealProviderConfig,
} from "../../src/application/runtime/agent-real-provider-config-preflight.js";

const baseConfig = {
  providerKind: "openai_compatible",
  model: "gpt-4.1-mini",
  endpointRef: "provider://openai-compatible/default",
  credentialRef: {
    provider: "openai",
    keyRef: "secret://llm/openai",
    scope: "project",
  },
  timeoutMs: 5000,
  quotaProfile: {
    profile: "default",
    maxRequestsPerWindow: 60,
    windowMs: 60000,
  },
  costProfile: {
    source: "not_calculated",
    currency: null,
  },
  metadata: {
    purpose: "phase-2.13",
    nested: { token: "sk-should-redact" },
  },
} as const;

describe("Agent real provider config preflight", () => {
  it("validates and redacts a provider config without resolving secret material", () => {
    const preflight = buildAgentRealProviderConfigPreflight({
      config: baseConfig,
      activeAdapterMode: "real",
      runtimeSafetyPolicy: {
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: true,
        allowProcessSpawn: false,
        requireCredentialRef: true,
        redactSnapshots: true,
        timeoutMs: 30000,
        maxTimeoutMs: 300000,
      },
    });

    expect(preflight).toMatchObject({
      mode: "agent_real_provider_config_preflight",
      configReady: true,
      providerKind: "openai_compatible",
      model: "gpt-4.1-mini",
      endpointRef: "provider://openai-compatible/default",
      endpointResolved: false,
      endpointNetworkChecked: false,
      credentialRefReady: true,
      secretMaterialRead: false,
      secretMaterialReturned: false,
      timeoutMs: 5000,
      timeoutWithinPolicy: true,
      quotaProfileReady: true,
      distributedQuotaReady: false,
      costProfileReady: true,
      costSource: "not_calculated",
      realProviderBillingEnabled: false,
      realAdapterWorkerEnabled: false,
      activeAdapterMode: "real",
      runtimeMode: "real_enabled",
      allowNetwork: true,
      blockedRealAdapterReason: "agent real adapter disabled fixture is not executable",
    });
    expect(preflight.redactedConfig).toMatchObject({
      credentialRef: {
        provider: "openai",
        keyRef: "secret://llm/openai",
        scope: "project",
      },
      metadata: {
        nested: { token: "[REDACTED]" },
      },
    });
    expect(JSON.stringify(preflight)).not.toContain("sk-should-redact");
  });

  it("rejects unsupported provider kind, inline secrets and timeout above max", () => {
    expect(() =>
      validateAgentRealProviderConfig({ ...baseConfig, providerKind: "anthropic" }, 300000),
    ).toThrow(ValidationError);
    expect(() =>
      validateAgentRealProviderConfig({
        ...baseConfig,
        credentialRef: { provider: "openai", keyRef: "sk-inline-secret", scope: "project" },
      }, 300000),
    ).toThrow("runtime credential keyRef must be a reference");
    expect(() =>
      validateAgentRealProviderConfig({ ...baseConfig, timeoutMs: 300001 }, 300000),
    ).toThrow("provider config timeout must be within [100, 300000]");
  });

  it("allows https endpoint refs syntactically without network checks", () => {
    const config = validateAgentRealProviderConfig({
      ...baseConfig,
      endpointRef: "https://api.openai.test/v1/chat/completions",
    }, 300000);

    expect(config.endpointRef).toBe("https://api.openai.test/v1/chat/completions");
  });
});
