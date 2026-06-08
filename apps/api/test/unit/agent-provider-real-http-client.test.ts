import { describe, expect, it } from "vitest";
import {
  RealAgentProviderHttpClient,
  type AgentProviderHttpNetworkPolicy,
  type IAgentProviderHttpTransport,
} from "../../src/application/runtime/agent-provider-real-http-client.js";
import type { AgentProviderHttpRequest } from "../../src/application/runtime/agent-provider-http-boundary.js";

const request = (overrides: Partial<AgentProviderHttpRequest> = {}): AgentProviderHttpRequest => ({
  method: "POST",
  urlRef: "provider://openai-compatible/chat-completions",
  headersRef: { authorization_ref: "secret://llm/openai-compatible" },
  body: { model: "gpt-test", messages: [{ role: "user", content: "hello" }] },
  timeoutMs: 30000,
  requestId: "real-http-req-1",
  ...overrides,
});

const policy = (overrides: Partial<AgentProviderHttpNetworkPolicy> = {}): AgentProviderHttpNetworkPolicy => ({
  realHttpEnabled: true,
  allowNetwork: true,
  allowedHosts: ["api.openai.test"],
  endpointMap: {
    "provider://openai-compatible/chat-completions": "https://api.openai.test/v1/chat/completions",
  },
  ...overrides,
});

describe("RealAgentProviderHttpClient skeleton", () => {
  it("fails closed when real HTTP or network is disabled", async () => {
    await expect(new RealAgentProviderHttpClient(policy({ realHttpEnabled: false })).send(request(), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "network_disabled", retryable: false });

    await expect(new RealAgentProviderHttpClient(policy({ allowNetwork: false })).send(request(), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "network_disabled", retryable: false });
  });

  it("requires endpoint mapping and host allowlist before using transport", async () => {
    await expect(new RealAgentProviderHttpClient(policy({ endpointMap: {} })).send(request(), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "connection_failed", retryable: false });

    await expect(new RealAgentProviderHttpClient(policy({ allowedHosts: ["other.test"] })).send(request(), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "network_disabled", retryable: false });
  });

  it("uses injected transport without injecting secret material", async () => {
    let seenSignal: AbortSignal | null = null;
    let seenHeaders: Record<string, string> = {};
    const transport: IAgentProviderHttpTransport = {
      async send(input) {
        seenSignal = input.signal;
        seenHeaders = input.headers;
        return {
          statusCode: 200,
          headersSnapshot: { "x-request-id": "real-provider-request" },
          bodySnapshot: { ok: true },
          providerRequestId: "real-provider-request",
          durationMs: 5,
        };
      },
    };

    const controller = new AbortController();
    const res = await new RealAgentProviderHttpClient(policy(), transport).send(request(), {
      signal: controller.signal,
      timeoutMs: 30000,
    });

    expect(res.providerRequestId).toBe("real-provider-request");
    expect(seenSignal).toBe(controller.signal);
    expect(JSON.stringify(seenHeaders)).not.toContain("Bearer");
    expect(JSON.stringify(seenHeaders)).not.toContain("sk-");
    expect(seenHeaders.authorization_ref).toBe("secret://llm/openai-compatible");
  });

  it("maps transport HTTP status failures to boundary errors", async () => {
    const cases = [
      [429, "rate_limited", true],
      [403, "auth_failed", false],
      [400, "bad_request", false],
      [500, "provider_error", true],
    ] as const;

    for (const [statusCode, type, retryable] of cases) {
      const transport: IAgentProviderHttpTransport = {
        async send() {
          return {
            statusCode,
            headersSnapshot: {},
            bodySnapshot: { message: `status ${statusCode}` },
            providerRequestId: `req-${statusCode}`,
            durationMs: 1,
          };
        },
      };
      await expect(new RealAgentProviderHttpClient(policy(), transport).send(request(), {
        signal: new AbortController().signal,
        timeoutMs: 30000,
      })).rejects.toMatchObject({ type, retryable, statusCode, providerRequestId: `req-${statusCode}` });
    }
  });
});
