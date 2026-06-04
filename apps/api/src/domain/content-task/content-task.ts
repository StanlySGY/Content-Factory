import {
  REQUIREMENT_SCHEMA_VERSION,
  type CreateTaskBody,
  type RequirementData,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskBody,
} from "@cf/shared";
import { ValidationError } from "../errors.js";
import { assertTransition } from "./status.js";

/** 任务可写字段（领域规范化结果，供仓储落库） */
export interface TaskWriteModel {
  title: string;
  content_type: string;
  priority: TaskPriority;
  status: TaskStatus;
  owner_id: string | null;
  requirement_data: RequirementData;
  due_at: string | null;
  archived_at: string | null;
}

function validateTitle(v: string): void {
  if (v.trim().length === 0) throw new ValidationError("title is required");
  if (v.length > 240) throw new ValidationError("title exceeds 240 characters");
}
function validateContentType(v: string): void {
  if (v.trim().length === 0)
    throw new ValidationError("content_type is required");
  if (v.length > 64)
    throw new ValidationError("content_type exceeds 64 characters");
}
function validateRequirement(v: RequirementData): void {
  if (!v || v.schema_version !== REQUIREMENT_SCHEMA_VERSION) {
    throw new ValidationError(
      `requirement_data.schema_version must be ${REQUIREMENT_SCHEMA_VERSION}`,
    );
  }
}

/** 创建任务：默认 draft，校验核心不变量（roadmap §4.3） */
export function createDraft(input: CreateTaskBody): TaskWriteModel {
  validateTitle(input.title);
  validateContentType(input.content_type);
  validateRequirement(input.requirement_data);
  return {
    title: input.title,
    content_type: input.content_type,
    priority: input.priority,
    status: "draft",
    owner_id: input.owner_id ?? null,
    requirement_data: input.requirement_data,
    due_at: input.due_at ?? null,
    archived_at: null,
  };
}

/** 已落库任务的当前态（应用 patch 的输入） */
export interface CurrentTask {
  status: TaskStatus;
}

/** 规范化后的字段级变更（仅含 patch 出现的字段；status 经状态机校验） */
export type TaskChanges = Partial<TaskWriteModel>;

/**
 * 应用更新：校验字段不变量与状态流转，返回需落库的变更集。
 * 转入 archived 时回填 archived_at；转出 archived 不在 S1 范围。
 */
export function applyUpdate(
  current: CurrentTask,
  patch: UpdateTaskBody,
): TaskChanges {
  const changes: TaskChanges = {};

  if (patch.title !== undefined) {
    validateTitle(patch.title);
    changes.title = patch.title;
  }
  if (patch.content_type !== undefined) {
    validateContentType(patch.content_type);
    changes.content_type = patch.content_type;
  }
  if (patch.priority !== undefined) changes.priority = patch.priority;
  if (patch.owner_id !== undefined) changes.owner_id = patch.owner_id ?? null;
  if (patch.requirement_data !== undefined) {
    validateRequirement(patch.requirement_data);
    changes.requirement_data = patch.requirement_data;
  }
  if (patch.due_at !== undefined) changes.due_at = patch.due_at ?? null;

  if (patch.status !== undefined && patch.status !== current.status) {
    assertTransition(current.status, patch.status);
    changes.status = patch.status;
    if (patch.status === "archived") changes.archived_at = new Date().toISOString();
  }

  return changes;
}
