# Sprint-5 Execution Phase 1 Audit

> Scope: implement the asynchronous execution skeleton only. No real Agent, MCP, LLM, Publisher, queue middleware, or UI integration is included.

## 1. Verdict

**GO for Phase 1 skeleton.**

The system now has an isolated execution plane:

- `execution_jobs`: mutable lifecycle table for async jobs.
- `outbox_events`: structural outbox for future relay consumption.
- Runtime ports: `IAgentRuntime`, `IMCPRuntime`, `IPublisherRuntime`.
- Mock adapters: Agent / MCP / Publisher, deterministic and local only.
- DB polling worker: claims pending jobs, runs mock adapter, writes terminal status and outbox event.
- Minimal API: create, get, and list execution jobs.

Sprint-4 Control Plane remains unchanged: workflow, review, Agent, MCP, audit hash chain, append-only trace tables, and permission model are not replaced or coupled to execution jobs.

## 2. Architecture Diagram

```text
Sprint-4 Control Plane (unchanged)
  Tasks / Workflow / Review / Agent / MCP / Audit / Append-only Trace
        |
        | no direct dependency in Phase 1
        v
Sprint-5 Execution Plane (new isolated skeleton)
  POST /api/execution/jobs
        |
        v
  execution_jobs(status: pending -> running -> success | failed)
        |
        v
  ExecutionWorker(DB polling, SKIP LOCKED, 5s default interval)
        |
        v
  Runtime Port
    - IAgentRuntime
    - IMCPRuntime
    - IPublisherRuntime
        |
        v
  Mock Adapter only
        |
        v
  execution_jobs terminal update + outbox_events append
```

## 3. Control Plane vs Execution Plane

| Area | Control Plane | Execution Plane Phase 1 |
| --- | --- | --- |
| Purpose | Domain state, review, assets, configuration, audit | Async job lifecycle skeleton |
| Transaction model | Existing `runInProject` + audit where applicable | Independent DB transaction, no project context |
| State machines | Existing Agent/MCP/Workflow/Review unchanged | New `ExecutionJob` state machine only |
| Trace tables | Existing append-only records unchanged | No writes to Agent/MCP/Workflow trace tables |
| Runtime | Existing mock control endpoints unchanged | New mock adapters behind runtime ports |
| Coupling | Business tables and audit invariants | No joins to business tables |

## 4. Job Flow

```text
1. POST /api/execution/jobs
2. Validate type, payload, idempotency_key
3. Insert execution_jobs(status=pending)
4. Insert outbox_events(event_type=execution_job.created) in the same transaction
5. Worker tick claims one pending job with FOR UPDATE SKIP LOCKED
6. Worker marks job running and increments attempt_count
7. Worker chooses runtime adapter by job.type
8. Mock adapter returns success or failed
9. Worker updates execution_jobs to terminal status
10. Worker writes outbox_events(event_type=execution_job.success|failed)
```

## 5. Outbox Design

`outbox_events` is present as a structural contract for Phase 2. Phase 1 only writes outbox events; it does not run a relay and does not consume events.

Events currently emitted:

- `execution_job.created`
- `execution_job.success`
- `execution_job.failed`

The completion event is written in the same transaction as the terminal job update.

## 6. Mock Runtime

Phase 1 adapters are 100% local mock implementations:

- `AgentMockRuntime`
- `MCPMockRuntime`
- `PublisherMockRuntime`

Behavior is deterministic:

- default payload: `success`
- `payload.mockStatus = "failed"`: returns failed
- `payload.mockStatus = "blocked"`: maps to failed with `output.blocked = true`

No network, LLM, MCP transport, external process, or publisher API call is allowed in Phase 1.

## 7. API Surface

Minimal control-plane API:

- `POST /api/execution/jobs`
- `GET /api/execution/jobs/:id`
- `GET /api/execution/jobs?status=`

The API does not replace existing Agent/MCP/Workflow APIs and is not exposed in the UI.

## 8. Non-goals

- No real Agent execution.
- No real MCP transport or tool dispatch.
- No LLM call.
- No actual Publisher integration or external publishing.
- No Redis, RabbitMQ, or external queue middleware.
- No Workflow / Review / Agent / MCP state machine changes.
- No UI change.
- No joins to `agent_sessions`, `tool_invocations`, `workflow_runs`, `review_records`, or `publish_records`.

## 9. Future Roadmap

### Phase 2: Real Adapters

- Add real `LlmAgentRuntime`.
- Add real MCP transport runtime for stdio / HTTP / SSE / WS.
- Add retry, timeout, and dead-letter handling.
- Wire selected control-plane events into execution jobs through a real relay.

### Phase 3: Productized Publishing

- Add Publisher control plane first: `publish_records`, approval/preparation flow, and UI.
- Add publisher runtime adapter after control-plane data model exists.
- Keep publish records anchored to immutable asset versions.

## 10. Verification

Phase 1 verification covers:

- Execution job validation and lifecycle.
- Worker claim and terminal update.
- Mock runtime success, failure, and blocked behavior.
- Idempotency key conflict handling.
- Outbox write on job creation and terminal completion.
- Minimal execution job API.

Current validation command:

```bash
pnpm --dir apps/api exec vitest run test/unit/execution-job.test.ts test/unit/execution-mock-runtime.test.ts test/integration/execution-layer.test.ts test/integration/execution-api.test.ts
```
