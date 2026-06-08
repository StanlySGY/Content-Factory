import { ValidationError } from "../../domain/errors.js";

export const CONTROL_PLANE_WRITEBACK_TRANSACTION_METHODS = [
  "load_subject",
  "validate_state_transition",
  "update_subject",
  "append_audit_event",
  "mark_writeback_applied",
] as const;

export type ControlPlaneWritebackTransactionMethod = (typeof CONTROL_PLANE_WRITEBACK_TRANSACTION_METHODS)[number];

export interface ControlPlaneWritebackTransactionCapabilities {
  kind: "disabled_control_plane_transaction_port";
  registered: false;
  canReadSubject: false;
  canValidateStateTransition: false;
  canUpdateSubject: false;
  canAppendAudit: false;
  canMarkApplied: false;
  missingRequirements: string[];
}

export interface ControlPlaneWritebackTransactionBaseInput {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
}

export interface ValidateStateTransitionInput extends ControlPlaneWritebackTransactionBaseInput {
  expectedCurrentStatus: string;
  targetStatus: string;
}

export interface UpdateSubjectInput extends ControlPlaneWritebackTransactionBaseInput {
  targetStatus: string;
}

export interface AppendAuditEventInput extends ControlPlaneWritebackTransactionBaseInput {
  auditEventType: string;
}

export interface ControlPlaneWritebackTransactionResult {
  method: ControlPlaneWritebackTransactionMethod;
  status: "blocked";
  executed: false;
  controlPlaneReadPerformed: false;
  controlPlaneWritePerformed: false;
  auditWritePerformed: false;
  missingRequirements: string[];
}

export interface ControlPlaneWritebackTransactionPort {
  capabilities(): ControlPlaneWritebackTransactionCapabilities;
  loadSubject(input: ControlPlaneWritebackTransactionBaseInput): Promise<ControlPlaneWritebackTransactionResult>;
  validateStateTransition(input: ValidateStateTransitionInput): Promise<ControlPlaneWritebackTransactionResult>;
  updateSubject(input: UpdateSubjectInput): Promise<ControlPlaneWritebackTransactionResult>;
  appendAuditEvent(input: AppendAuditEventInput): Promise<ControlPlaneWritebackTransactionResult>;
  markWritebackApplied(input: ControlPlaneWritebackTransactionBaseInput): Promise<ControlPlaneWritebackTransactionResult>;
}

export interface ControlPlaneWritebackTransactionMethodReadiness {
  method: ControlPlaneWritebackTransactionMethod;
  status: "blocked";
  executed: false;
  missingRequirements: string[];
}

export interface ExecutionWritebackTransactionPortReadiness {
  mode: "disabled_transaction_port";
  executable: false;
  transactionPortRegistered: false;
  controlPlaneReadAllowed: false;
  controlPlaneWriteAllowed: false;
  auditWriteAllowed: false;
  capabilities: ControlPlaneWritebackTransactionCapabilities;
  methods: ControlPlaneWritebackTransactionMethodReadiness[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const PORT_DISABLED = "control-plane transaction port is disabled";
const CONTROL_PLANE_READ_DISABLED = "control-plane read is disabled";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane write is disabled";
const AUDIT_WRITE_DISABLED = "audit write is disabled";
const STATE_MACHINE_ADAPTER_DISABLED = "state machine adapter is disabled";
const WRITEBACK_LEDGER_APPLY_DISABLED = "writeback applied marker is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "connect the port to a control-plane repository only behind the apply guard",
  "load workflow_stage_run inside the future transaction boundary",
  "validate ADR-006 state transition through the control-plane state machine",
  "append audit event and mark writeback applied in the same database transaction",
] as const;

const METHOD_REQUIREMENTS: Record<ControlPlaneWritebackTransactionMethod, string[]> = {
  load_subject: [PORT_DISABLED, CONTROL_PLANE_READ_DISABLED],
  validate_state_transition: [PORT_DISABLED, STATE_MACHINE_ADAPTER_DISABLED],
  update_subject: [PORT_DISABLED, CONTROL_PLANE_WRITE_DISABLED],
  append_audit_event: [PORT_DISABLED, AUDIT_WRITE_DISABLED],
  mark_writeback_applied: [PORT_DISABLED, WRITEBACK_LEDGER_APPLY_DISABLED],
};

function capabilities(): ControlPlaneWritebackTransactionCapabilities {
  return {
    kind: "disabled_control_plane_transaction_port",
    registered: false,
    canReadSubject: false,
    canValidateStateTransition: false,
    canUpdateSubject: false,
    canAppendAudit: false,
    canMarkApplied: false,
    missingRequirements: [
      PORT_DISABLED,
      CONTROL_PLANE_READ_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      AUDIT_WRITE_DISABLED,
      STATE_MACHINE_ADAPTER_DISABLED,
      WRITEBACK_LEDGER_APPLY_DISABLED,
    ],
  };
}

function blocked(method: ControlPlaneWritebackTransactionMethod): ControlPlaneWritebackTransactionResult {
  return {
    method,
    status: "blocked",
    executed: false,
    controlPlaneReadPerformed: false,
    controlPlaneWritePerformed: false,
    auditWritePerformed: false,
    missingRequirements: METHOD_REQUIREMENTS[method],
  };
}

export function buildDisabledControlPlaneWritebackTransactionPort(): ControlPlaneWritebackTransactionPort {
  return {
    capabilities,
    async loadSubject() {
      return blocked("load_subject");
    },
    async validateStateTransition() {
      return blocked("validate_state_transition");
    },
    async updateSubject() {
      return blocked("update_subject");
    },
    async appendAuditEvent() {
      return blocked("append_audit_event");
    },
    async markWritebackApplied() {
      return blocked("mark_writeback_applied");
    },
  };
}

export function buildExecutionWritebackTransactionPortReadiness(): ExecutionWritebackTransactionPortReadiness {
  const caps = capabilities();
  const readiness: ExecutionWritebackTransactionPortReadiness = {
    mode: "disabled_transaction_port",
    executable: false,
    transactionPortRegistered: false,
    controlPlaneReadAllowed: false,
    controlPlaneWriteAllowed: false,
    auditWriteAllowed: false,
    capabilities: caps,
    methods: CONTROL_PLANE_WRITEBACK_TRANSACTION_METHODS.map((method) => ({
      method,
      status: "blocked",
      executed: false,
      missingRequirements: METHOD_REQUIREMENTS[method],
    })),
    missingRequirements: caps.missingRequirements,
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateControlPlaneWritebackTransactionPortReadiness(readiness);
  return readiness;
}

export function validateControlPlaneWritebackTransactionPortReadiness(
  readiness: ExecutionWritebackTransactionPortReadiness,
): void {
  if (readiness.mode !== "disabled_transaction_port")
    throw new ValidationError(`invalid writeback transaction port readiness mode: ${readiness.mode}`);
  if (readiness.executable !== false)
    throw new ValidationError("writeback transaction port readiness must not be executable");
  if (readiness.transactionPortRegistered !== false)
    throw new ValidationError("writeback transaction port must not be registered");
  if (readiness.controlPlaneReadAllowed !== false)
    throw new ValidationError("writeback transaction port must not allow control-plane reads");
  if (readiness.controlPlaneWriteAllowed !== false)
    throw new ValidationError("writeback transaction port must not allow control-plane writes");
  if (readiness.auditWriteAllowed !== false)
    throw new ValidationError("writeback transaction port must not allow audit writes");
  if (readiness.capabilities.kind !== "disabled_control_plane_transaction_port")
    throw new ValidationError("writeback transaction port capabilities kind is invalid");
  if (readiness.capabilities.registered !== false)
    throw new ValidationError("writeback transaction port capabilities must be unregistered");
  if (
    readiness.capabilities.canReadSubject !== false ||
    readiness.capabilities.canValidateStateTransition !== false ||
    readiness.capabilities.canUpdateSubject !== false ||
    readiness.capabilities.canAppendAudit !== false ||
    readiness.capabilities.canMarkApplied !== false
  )
    throw new ValidationError("writeback transaction port capabilities must be disabled");
  if (JSON.stringify(readiness.methods.map((m) => m.method)) !== JSON.stringify(CONTROL_PLANE_WRITEBACK_TRANSACTION_METHODS))
    throw new ValidationError("writeback transaction port methods are incomplete");
  if (!readiness.methods.every((m) => m.status === "blocked" && m.executed === false))
    throw new ValidationError("writeback transaction port methods must be blocked");
  if (!readiness.methods.every((m) => m.missingRequirements.length > 0))
    throw new ValidationError("writeback transaction port method missing requirements are required");
  if (readiness.missingRequirements.length === 0)
    throw new ValidationError("writeback transaction port missing requirements are required");
  if (readiness.nextPhaseRequirements.length === 0)
    throw new ValidationError("writeback transaction port next phase requirements are required");
}
