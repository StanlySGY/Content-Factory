import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackSubjectSnapshotReadiness,
  buildWorkflowStageRunSubjectSnapshotShape,
  validateExecutionWritebackSubjectSnapshotReadiness,
} from "../../src/domain/execution/writeback-subject-snapshot.js";

describe("Execution writeback subject snapshot disabled harness", () => {
  it("exposes a disabled workflow_stage_run subject snapshot readiness", () => {
    const readiness = buildExecutionWritebackSubjectSnapshotReadiness();

    expect(readiness).toMatchObject({
      mode: "disabled_subject_snapshot_readiness",
      enabled: false,
      executable: false,
      subjectType: "workflow_stage_run",
      snapshotReaderRegistered: false,
      canReadSubject: false,
      canBuildSnapshot: false,
      canPersistSnapshot: false,
      redactionRequired: true,
      sampleSnapshotBuilt: false,
    });
    expect(readiness.requiredFields).toEqual([
      "id",
      "workflow_run_id",
      "workflow_stage_id",
      "status",
      "attempt_count",
      "gate_result",
      "updated_at",
    ]);
    expect(readiness.missingRequirements).toContain("subject snapshot reader is disabled");
    expect(() => validateExecutionWritebackSubjectSnapshotReadiness(readiness)).not.toThrow();
    expect(() =>
      validateExecutionWritebackSubjectSnapshotReadiness({
        ...readiness,
        executable: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackSubjectSnapshotReadiness({
        ...readiness,
        canReadSubject: true,
      } as never),
    ).toThrow(ValidationError);
  });

  it("defines the future workflow_stage_run snapshot shape without DB reads", () => {
    const shape = buildWorkflowStageRunSubjectSnapshotShape();

    expect(shape).toMatchObject({
      subjectType: "workflow_stage_run",
      sourceTable: "stage_runs",
      dbReadPerformed: false,
      controlPlaneWritePerformed: false,
      redactionApplied: true,
      redactionPolicy: "metadata_only_no_secret_material",
    });
    expect(shape.fields.map((field) => field.name)).toEqual([
      "id",
      "workflow_run_id",
      "workflow_stage_id",
      "status",
      "attempt_count",
      "gate_result",
      "updated_at",
    ]);
    expect(shape.fields.find((field) => field.name === "gate_result")).toMatchObject({
      required: false,
      nullable: true,
      redacted: true,
    });
    expect(shape.sample).toMatchObject({
      id: null,
      workflow_run_id: null,
      workflow_stage_id: null,
      status: null,
      attempt_count: null,
      gate_result: null,
      updated_at: null,
    });
  });
});
