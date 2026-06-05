// 领域错误：携带 HTTP 映射与统一错误码（api §2.3）；领域层零框架依赖

export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;
  readonly retryable: boolean = false;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

/** 领域不变量 / 输入校验失败 → 400（api §2.3；统一校验失败语义） */
export class ValidationError extends AppError {
  readonly httpStatus = 400;
  readonly code = "validation_failed";
}

/** 状态机非法流转 → 409 */
export class InvalidTransitionError extends AppError {
  readonly httpStatus = 409;
  readonly code = "invalid_state_transition";
}

/** 资源不存在 → 404 */
export class NotFoundError extends AppError {
  readonly httpStatus = 404;
  readonly code = "not_found";
}

/** 唯一约束冲突（活跃实例唯一 / 唯一键 / 乐观锁）→ 409 */
export class ConflictError extends AppError {
  readonly httpStatus = 409;
  readonly code = "conflict";
}
