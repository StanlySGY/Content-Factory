import type { EditorStateDTO } from "@cf/shared";
import type { Db } from "../infrastructure/db/client.js";
import * as taskRepo from "../infrastructure/repositories/content-task.repository.js";
import * as editorRepo from "../infrastructure/repositories/editor.repository.js";
import { toEditorStateDTO } from "./mappers.js";

// EditorQueryService：只读查询，封装 editor 仓储聚合并组装 DTO。无状态机/工作流/资产/Review 逻辑、无事务。
// editor 仓储已校验 task 归属（不存在/跨项目抛 NotFound，透传）；task 行由 findTaskById 补齐供 DTO。
export class EditorQueryService {
  constructor(private readonly db: Db) {}

  async getEditorState(projectId: string, taskId: string): Promise<EditorStateDTO> {
    const data = await editorRepo.getEditorState(this.db, projectId, taskId);
    const task = await taskRepo.findTaskById(this.db, projectId, taskId);
    return toEditorStateDTO(task, data);
  }
}
