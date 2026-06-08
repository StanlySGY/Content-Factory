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
    expect(seenSignal).not.toBeNull();
    expect(seenSignal).not.toBe(controller.signal);
    expect(seenSignal!.aborted).toBe(false);
    expect(JSON.stringify(seenHeaders)).not.toContain("Bearer");
    expect(JSON.stringify(seenHeaders)).not.toContain("sk-");
    expect(seenHeaders.authorization_ref).toBe("secret://llm/openai-compatible");
  });

  it("injects resolved credential material only into the transport boundary", async () => {
    let seenHeaders: Record<string, string> = {};
    const transport: IAgentProviderHttpTransport = {
      async send(input) {
        seenHeaders = input.headers;
        return {
          statusCode: 200,
          headersSnapshot: {},
          bodySnapshot: { ok: true },
          providerRequestId: "credential-injected",
          durationMs: 1,
        };
      },
    };

    const res = await new RealAgentProviderHttpClient(policy(), transport, {
      async resolve(ref) {
        expect(ref).toEqual({
          provider: "openai_compatible",
          keyRef: "secret://llm/openai-compatible",
          scope: "project",
        });
        return {
          provider: "openai_compatible",
          scope: "project",
          keyRef: "secret://llm/openai-compatible",
          resolved: true,
          material: "sk-test-transport-only",
          metadata: { source: "unit-test" },
        };
      },
    }).send(request({ headersRef: { authorization_ref: "secret://llm/openai-compatible" } }), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    });

    expect(res.providerRequestId).toBe("credential-injected");
    expect(seenHeaders).toEqual({ Authorization: "Bearer sk-test-transport-only" });
    expect(JSON.stringify(res)).not.toContain("sk-test-transport-only");
  });

  it("rejects mismatched credential resolution before calling transport", async () => {
    let called = false;
    const transport: IAgentProviderHttpTransport = {
      async send() {
        called = true;
        throw new Error("should not call transport");
      },
    };

    await expect(new RealAgentProviderHttpClient(policy(), transport, {
      async resolve() {
        return {
          provider: "other",
          scope: "project",
          keyRef: "secret://llm/openai-compatible",
          resolved: true,
          material: "sk-test-transport-only",
          metadata: {},
        };
      },
    }).send(request({ headersRef: { authorization_ref: "secret://llm/openai-compatible" } }), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "auth_failed", retryable: false });
    expect(called).toBe(false);
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

  it("aborts the transport signal and maps client timeout without network IO", async () => {
    let transportAbortSeen = false;
    const transport: IAgentProviderHttpTransport = {
      async send(input) {
        input.signal.addEventListener("abort", () => {
          transportAbortSeen = true;
        });
        return new Promise(() => undefined);
      },
    };

    await expect(new RealAgentProviderHttpClient(policy(), transport).send(request(), {
      signal: new AbortController().signal,
      timeoutMs: 5,
    })).rejects.toMatchObject({ type: "timeout", retryable: true, statusCode: 408 });
    expect(transportAbortSeen).toBe(true);
  });

  it("propagates parent abort to the transport boundary", async () => {
    let transportAbortSeen = false;
    const transport: IAgentProviderHttpTransport = {
      async send(input) {
        return new Promise((_, reject) => {
          input.signal.addEventListener("abort", () => {
            transportAbortSeen = true;
            reject({ type: "aborted", retryable: true, statusCode: 408, message: "request aborted" });
          });
        });
      },
    };

    const controller = new AbortController();
    const pending = new RealAgentProviderHttpClient(policy(), transport).send(request(), {
      signal: controller.signal,
      timeoutMs: 30000,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ type: "aborted", retryable: true, statusCode: 408 });
    expect(transportAbortSeen).toBe(true);
  });
});
