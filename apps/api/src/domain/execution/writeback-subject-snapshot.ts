import { ValidationError } from "../errors.js";

export const WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT = "workflow_stage_run" as const;
export const WRITEBACK_SUBJECT_SNAPSHOT_SOURCE_TABLE = "stage_runs" as const;
export const WRITEBACK_SUBJECT_SNAPSHOT_REDACTION_POLICY = "metadata_only_no_secret_material" as const;

export const WORKFLOW_STAGE_RUN_SNAPSHOT_REQUIRED_FIELDS = [
  "id",
  "workflow_run_id",
  "workflow_stage_id",
  "status",
  "attempt_count",
  "gate_result",
  "updated_at",
] as const;

export type WorkflowStageRunSnapshotFieldName = (typeof WORKFLOW_STAGE_RUN_SNAPSHOT_REQUIRED_FIELDS)[number];

export interface WorkflowStageRunSubjectSnapshotField {
  name: WorkflowStageRunSnapshotFieldName;
  type: "uuid" | "stage_run_status" | "integer" | "json" | "datetime";
  required: boolean;
  nullable: boolean;
  redacted: boolean;
}

export type WorkflowStageRunSubjectSnapshotSample = Record<WorkflowStageRunSnapshotFieldName, null>;

export interface WorkflowStageRunSubjectSnapshotShape {
  subjectType: typeof WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT;
  sourceTable: typeof WRITEBACK_SUBJECT_SNAPSHOT_SOURCE_TABLE;
  fields: WorkflowStageRunSubjectSnapshotField[];
  sample: WorkflowStageRunSubjectSnapshotSample;
  dbReadPerformed: false;
  controlPlaneWritePerformed: false;
  redactionApplied: true;
  redactionPolicy: typeof WRITEBACK_SUBJECT_SNAPSHOT_REDACTION_POLICY;
}

export interface ExecutionWritebackSubjectSnapshotReadiness {
  mode: "disabled_subject_snapshot_readiness";
  enabled: false;
  executable: false;
  subjectType: typeof WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT;
  snapshotReaderRegistered: false;
  canReadSubject: false;
  canBuildSnapshot: false;
  canPersistSnapshot: false;
  redactionRequired: true;
  sampleSnapshotBuilt: false;
  requiredFields: WorkflowStageRunSnapshotFieldName[];
  snapshotShape: WorkflowStageRunSubjectSnapshotShape;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const SNAPSHOT_READER_DISABLED = "subject snapshot reader is disabled";
const SNAPSHOT_READER_NOT_REGISTERED = "subject snapshot reader is not registered";
const CONTROL_PLANE_READ_DISABLED = "control-plane subject read is disabled";
const SNAPSHOT_BUILD_DISABLED = "subject snapshot build is disabled";
const SNAPSHOT_PERSIST_DISABLED = "subject snapshot persistence is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "register the workflow_stage_run subject snapshot reader behind the transaction port",
  "read workflow_stage_run only inside the future control-plane transaction",
  "redact gate_result metadata before persisting execution snapshots",
  "feed the subject snapshot into ADR-006 state transition validation",
] as const;

const SNAPSHOT_FIELDS: WorkflowStageRunSubjectSnapshotField[] = [
  { name: "id", type: "uuid", required: true, nullable: false, redacted: false },
  { name: "workflow_run_id", type: "uuid", required: true, nullable: false, redacted: false },
  { name: "workflow_stage_id", type: "uuid", required: true, nullable: false, redacted: false },
  { name: "status", type: "stage_run_status", required: true, nullable: false, redacted: false },
  { name: "attempt_count", type: "integer", required: true, nullable: false, redacted: false },
  { name: "gate_result", type: "json", required: false, nullable: true, redacted: true },
  { name: "updated_at", type: "datetime", required: true, nullable: false, redacted: false },
] as const;

function missingRequirements(): string[] {
  return [
    SNAPSHOT_READER_DISABLED,
    SNAPSHOT_READER_NOT_REGISTERED,
    CONTROL_PLANE_READ_DISABLED,
    SNAPSHOT_BUILD_DISABLED,
    SNAPSHOT_PERSIST_DISABLED,
  ];
}

export function buildWorkflowStageRunSubjectSnapshotShape(): WorkflowStageRunSubjectSnapshotShape {
  return {
    subjectType: WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT,
    sourceTable: WRITEBACK_SUBJECT_SNAPSHOT_SOURCE_TABLE,
    fields: [...SNAPSHOT_FIELDS],
    sample: {
      id: null,
      workflow_run_id: null,
      workflow_stage_id: null,
      status: null,
      attempt_count: null,
      gate_result: null,
      updated_at: null,
    },
    dbReadPerformed: false,
    controlPlaneWritePerformed: false,
    redactionApplied: true,
    redactionPolicy: WRITEBACK_SUBJECT_SNAPSHOT_REDACTION_POLICY,
  };
}

export function buildExecutionWritebackSubjectSnapshotReadiness(): ExecutionWritebackSubjectSnapshotReadiness {
  const readiness: ExecutionWritebackSubjectSnapshotReadiness = {
    mode: "disabled_subject_snapshot_readiness",
    enabled: false,
    executable: false,
    subjectType: WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT,
    snapshotReaderRegistered: false,
    canReadSubject: false,
    canBuildSnapshot: false,
    canPersistSnapshot: false,
    redactionRequired: true,
    sampleSnapshotBuilt: false,
    requiredFields: [...WORKFLOW_STAGE_RUN_SNAPSHOT_REQUIRED_FIELDS],
    snapshotShape: buildWorkflowStageRunSubjectSnapshotShape(),
    missingRequirements: missingRequirements(),
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackSubjectSnapshotReadiness(readiness);
  return readiness;
}

export function validateExecutionWritebackSubjectSnapshotReadiness(
  readiness: ExecutionWritebackSubjectSnapshotReadiness,
): void {
  if (readiness.mode !== "disabled_subject_snapshot_readiness")
    throw new ValidationError(`invalid writeback subject snapshot readiness mode: ${readiness.mode}`);
  if (readiness.enabled !== false)
    throw new ValidationError("writeback subject snapshot readiness must be disabled");
  if (readiness.executable !== false)
    throw new ValidationError("writeback subject snapshot readiness must not be executable");
  if (readiness.subjectType !== WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT)
    throw new ValidationError("writeback subject snapshot subject type is invalid");
  if (readiness.snapshotReaderRegistered !== false)
    throw new ValidationError("writeback subject snapshot reader must not be registered");
  if (
    readiness.canReadSubject !== false ||
    readiness.canBuildSnapshot !== false ||
    readiness.canPersistSnapshot !== false
  )
    throw new ValidationError("writeback subject snapshot capabilities must be disabled");
  if (readiness.redactionRequired !== true)
    throw new ValidationError("writeback subject snapshot redaction must be required");
  if (readiness.sampleSnapshotBuilt !== false)
    throw new ValidationError("writeback subject snapshot sample must not be built from live data");
  if (JSON.stringify(readiness.requiredFields) !== JSON.stringify(WORKFLOW_STAGE_RUN_SNAPSHOT_REQUIRED_FIELDS))
    throw new ValidationError("writeback subject snapshot required fields are invalid");
  if (readiness.snapshotShape.subjectType !== WRITEBACK_SUBJECT_SNAPSHOT_SUBJECT)
    throw new ValidationError("writeback subject snapshot shape subject type is invalid");
  if (
    readiness.snapshotShape.dbReadPerformed !== false ||
    readiness.snapshotShape.controlPlaneWritePerformed !== false
  )
    throw new ValidationError("writeback subject snapshot shape must not perform control-plane side effects");
  if (readiness.snapshotShape.redactionApplied !== true)
    throw new ValidationError("writeback subject snapshot redaction must be applied");
  if (readiness.snapshotShape.redactionPolicy !== WRITEBACK_SUBJECT_SNAPSHOT_REDACTION_POLICY)
    throw new ValidationError("writeback subject snapshot redaction policy is invalid");
  if (readiness.missingRequirements.length === 0)
    throw new ValidationError("writeback subject snapshot missing requirements are required");
  if (readiness.nextPhaseRequirements.length === 0)
    throw new ValidationError("writeback subject snapshot next phase requirements are required");
}
