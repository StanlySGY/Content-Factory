import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_TASK,
  type AuditEventDTO,
  type ContentTaskDTO,
  type CreateTaskBody,
  type ListTasksQuery,
  type PaginatedTasks,
  type TaskStatus,
  type UpdateTaskBody,
} from "@cf/shared";
import { applyUpdate, createDraft } from "../domain/content-task/content-task.js";
import { NotFoundError } from "../domain/errors.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import * as taskRepo from "../infrastructure/repositories/content-task.repository.js";
import { getAuditTrail, recordAudit } from "./audit.service.js";
import { taskSnapshot, toTaskDTO } from "./mappers.js";

export interface RequestContext {
  projectId: string;
  actorId: string | null;
  requestId: string;
}

export class TaskService {
  constructor(
    private readonly db: Db,
    private readonly auditDb: Db,
  ) {}

  /** 创建任务（默认 draft）+ 初始审计事件（单事务，db §10.1） */
  async create(ctx: RequestContext, body: CreateTaskBody): Promise<ContentTaskDTO> {
    const write = createDraft(body);
    const row = await runInProject(this.db, ctx.projectId, async (tx) => {
      const created = await taskRepo.insertTask(tx, ctx.projectId, write);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_TASK,
        subjectId: created.id,
        action: AUDIT_ACTIONS.taskCreated,
        before: null,
        after: taskSnapshot(created),
        metadata: { request_id: ctx.requestId },
      });
      return created;
    });
    return toTaskDTO(row);
  }

  async list(ctx: RequestContext, query: ListTasksQuery): Promise<PaginatedTasks> {
    const r = await runInProject(this.db, ctx.projectId, (tx) =>
      taskRepo.listTasks(tx, ctx.projectId, query),
    );
    return {
      items: r.items.map(toTaskDTO),
      page: r.page,
      page_size: r.pageSize,
      total: r.total,
    };
  }

  async get(ctx: RequestContext, id: string): Promise<ContentTaskDTO> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      taskRepo.findTaskById(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`content_task ${id} not found`);
    return toTaskDTO(row);
  }

  /** 更新基础信息 / 状态流转（含 draft→ready）+ 审计（单事务） */
  async update(
    ctx: RequestContext,
    id: string,
    patch: UpdateTaskBody,
  ): Promise<ContentTaskDTO> {
    const row = await runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await taskRepo.findTaskById(tx, ctx.projectId, id);
      if (!current) throw new NotFoundError(`content_task ${id} not found`);

      const changes = applyUpdate(
        { status: current.status as TaskStatus },
        patch,
      );
      if (Object.keys(changes).length === 0) return current; // 无实际变更

      const updated = await taskRepo.updateTask(tx, ctx.projectId, id, changes);
      if (!updated) throw new NotFoundError(`content_task ${id} not found`);

      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_TASK,
        subjectId: id,
        action: AUDIT_ACTIONS.taskUpdated,
        before: taskSnapshot(current),
        after: taskSnapshot(updated),
        metadata: { request_id: ctx.requestId, changed: Object.keys(changes) },
      });
      return updated;
    });
    return toTaskDTO(row);
  }

  /** 任务审计链（用户需求 #5）：先校验任务存在，再以审计读取身份读取（写读分离 ADR-008） */
  async auditTrail(ctx: RequestContext, id: string): Promise<AuditEventDTO[]> {
    await this.get(ctx, id);
    return runInProject(this.auditDb, ctx.projectId, (tx) =>
      getAuditTrail(tx, AUDIT_SUBJECT_TASK, id),
    );
  }
}
