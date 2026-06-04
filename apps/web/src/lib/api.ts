import type {
  AuditEventDTO,
  ContentTaskDTO,
  CreateTaskBody,
  ListTasksQuery,
  PaginatedTasks,
  UpdateTaskBody,
} from "@cf/shared";

/** 统一错误（对齐后端 api §2.3） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

function toQuery(q: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ status: string }>("GET", "/health"),
  listTasks: (q: ListTasksQuery) =>
    request<PaginatedTasks>("GET", `/tasks${toQuery(q)}`),
  getTask: (id: string) => request<ContentTaskDTO>("GET", `/tasks/${id}`),
  createTask: (b: CreateTaskBody) => request<ContentTaskDTO>("POST", "/tasks", b),
  updateTask: (id: string, b: UpdateTaskBody) =>
    request<ContentTaskDTO>("PATCH", `/tasks/${id}`, b),
  auditTrail: (id: string) =>
    request<AuditEventDTO[]>("GET", `/tasks/${id}/audit-events`),
};
