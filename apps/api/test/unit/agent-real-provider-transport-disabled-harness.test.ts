import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import { buildDefaultAgentRealProviderConfig } from "../../src/application/runtime/agent-real-provider-config-preflight.js";
import type { AgentRealProviderConfig } from "../../src/application/runtime/agent-real-provider-config-preflight.js";
import {
  buildAgentRealProviderTransportDisabledHarness,
  buildAgentRealProviderTransportRequest,
} from "../../src/application/runtime/agent-real-provider-transport-disabled-harness.js";

describe("Agent real provider transport disabled harness", () => {
  it("builds a stable provider HTTP request from provider config without secret material", async () => {
    const config = buildDefaultAgentRealProviderConfig(30000);
    const request = buildAgentRealProviderTransportRequest({
      config,
      messages: [{ role: "user", content: "draft a short outline" }],
      requestId: "phase-2-14-request",
    });

    expect(request).toMatchObject({
      method: "POST",
      urlRef: "provider://openai-compatible/default",
      headersRef: {
        Authorization: "secret://llm/openai",
      },
      timeoutMs: 30000,
      requestId: "phase-2-14-request",
      body: {
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: "draft a short outline" }],
      },
    });
    expect(JSON.stringify(request)).not.toContain("sk-");
    expect(JSON.stringify(request)).not.toContain("Bearer ");
  });

  it("rejects inline secret-like credential refs before transport invocation", () => {
    const config: AgentRealProviderConfig = {
      ...buildDefaultAgentRealProviderConfig(30000),
      credentialRef: { provider: "openai", keyRef: "sk-inline-secret", scope: "project" },
    };

    expect(() =>
      buildAgentRealProviderTransportRequest({
        config,
        messages: [{ role: "user", content: "hello" }],
        requestId: "phase-2-14-inline-secret",
      }),
    ).toThrow(ValidationError);
  });

  it("uses disabled transport to prove fail-closed without network execution", async () => {
    const harness = await buildAgentRealProviderTransportDisabledHarness({
      config: buildDefaultAgentRealProviderConfig(30000),
      messages: [{ role: "user", content: "hello" }],
      requestId: "phase-2-14-disabled",
      policy: {
        realHttpEnabled: true,
        allowNetwork: true,
        allowedHosts: ["api.openai.test"],
        endpointMap: {
          "provider://openai-compatible/default": "https://api.openai.test/v1/chat/completions",
        },
      },
      contextTimeoutMs: 30000,
    });

    expect(harness).toMatchObject({
      mode: "agent_real_provider_transport_disabled_harness",
      requestShapeReady: true,
      disabledTransportReady: true,
      transportExecutable: false,
      networkAttempted: false,
      secretMaterialRead: false,
      secretMaterialReturned: false,
      failClosed: true,
      failClosedErrorType: "auth_failed",
      failClosedRetryable: false,
      realAdapterWorkerEnabled: false,
    });
    expect(harness.redactedRequest).toMatchObject({
      method: "POST",
      urlRef: "provider://openai-compatible/default",
      headersRef: {
        Authorization: "[REDACTED]",
      },
      body: {
        model: "gpt-4.1-mini",
      },
    });
  });
});
