import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../domain/errors.js";

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): void {
  reply.code(status).send({
    error: { code, message, retryable, ...(details ? { details } : {}) },
    request_id: request.id,
  });
}

/** 统一错误结构（api §2.3）：领域错误按 httpStatus 映射；校验失败 400；其余 5xx 返回参考号 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    send(
      reply,
      request,
      404,
      "not_found",
      `route not found: ${request.method} ${request.url}`,
      false,
    );
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      send(reply, request, error.httpStatus, error.code, error.message, error.retryable, error.details);
      return;
    }
    if (error.validation) {
      send(reply, request, 400, "bad_request", error.message, false, {
        validation: error.validation as unknown as Record<string, unknown>,
      });
      return;
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "unhandled error");
      send(reply, request, 500, "internal_error", "internal server error", false, {
        reference: request.id,
      });
      return;
    }
    send(reply, request, status, "error", error.message, false);
  });
}
