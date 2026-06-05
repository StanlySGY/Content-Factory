import {
  SUPPORTED_SCHEMA_VERSIONS,
  type WorkflowContractField,
} from "@cf/shared";
import { ValidationError } from "../errors.js";

// JSON 契约 schema_version 统一校验器（ADR-015 / db §6.4）；禁止散落实现。

export type SchemaVersionReason = "missing" | "not_number" | "unsupported";

export interface SchemaVersionResult {
  valid: boolean;
  error?: {
    field: string;
    reason: SchemaVersionReason;
    message: string;
    got?: unknown;
  };
}

/** 校验任意 JSON 契约的 schema_version：缺失 / 非数字 / 未知版本均 invalid（结构化结果）*/
export function validateSchemaVersion(
  value: unknown,
  field: string,
  supported: readonly number[],
): SchemaVersionResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      valid: false,
      error: {
        field,
        reason: "missing",
        message: `${field} must be an object carrying schema_version`,
      },
    };
  }
  const sv = (value as Record<string, unknown>).schema_version;
  if (sv === undefined || sv === null) {
    return {
      valid: false,
      error: {
        field,
        reason: "missing",
        message: `${field}.schema_version is required`,
      },
    };
  }
  if (typeof sv !== "number" || !Number.isFinite(sv)) {
    return {
      valid: false,
      error: {
        field,
        reason: "not_number",
        message: `${field}.schema_version must be a number`,
        got: sv,
      },
    };
  }
  if (!supported.includes(sv)) {
    return {
      valid: false,
      error: {
        field,
        reason: "unsupported",
        message: `${field}.schema_version ${sv} is not supported`,
        got: sv,
      },
    };
  }
  return { valid: true };
}

/** 按已知契约字段校验（支持集来自 SUPPORTED_SCHEMA_VERSIONS）*/
export function validateContractField(
  field: WorkflowContractField,
  value: unknown,
): SchemaVersionResult {
  return validateSchemaVersion(value, field, SUPPORTED_SCHEMA_VERSIONS[field]);
}

/** 统一抛出入口：失败抛 ValidationError（→422）*/
export function assertSchemaVersion(
  value: unknown,
  field: WorkflowContractField,
): void {
  const r = validateContractField(field, value);
  if (!r.valid) throw new ValidationError(r.error!.message, { ...r.error });
}
