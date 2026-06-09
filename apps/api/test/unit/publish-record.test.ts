import { describe, expect, it } from "vitest";
import { InvalidTransitionError, ValidationError } from "../../src/domain/errors.js";
import {
  assertPublisherChannelTransition,
  validatePublisherChannel,
  validatePublisherChannelStatus,
} from "../../src/domain/publisher/channel.js";
import {
  publishRecordSnapshot,
  transitionPublishRecordStatus,
  validateCreatePublishRecord,
  validatePublishRecordStatus,
} from "../../src/domain/publisher/publish-record.js";

const valid = {
  content_task_id: "00000000-0000-0000-0000-000000000001",
  content_asset_id: "00000000-0000-0000-0000-000000000002",
  asset_version_id: "00000000-0000-0000-0000-000000000003",
  channel: "wechat_mp",
  idempotency_key: "publish-idem-1",
  metadata: { title: "Release" },
};

describe("PublishRecord domain", () => {
  it("validates version-pinned publish record creation", () => {
    expect(() => validateCreatePublishRecord(valid)).not.toThrow();
    expect(() => validateCreatePublishRecord({ ...valid, content_task_id: "bad" })).toThrow(ValidationError);
    expect(() => validateCreatePublishRecord({ ...valid, content_asset_id: "bad" })).toThrow(ValidationError);
    expect(() => validateCreatePublishRecord({ ...valid, asset_version_id: "" })).toThrow(/asset_version_id/);
    expect(() => validateCreatePublishRecord({ ...valid, channel: "" })).toThrow(/channel/);
    expect(() => validateCreatePublishRecord({ ...valid, channel: "x".repeat(65) })).toThrow(ValidationError);
    expect(() => validateCreatePublishRecord({ ...valid, idempotency_key: "x".repeat(201) })).toThrow(ValidationError);
    expect(() => validateCreatePublishRecord({ ...valid, metadata: [] as never })).toThrow(ValidationError);
  });

  it("allows only deterministic status transitions", () => {
    expect(transitionPublishRecordStatus("pending", "publishing")).toBe("publishing");
    expect(transitionPublishRecordStatus("publishing", "published")).toBe("published");
    expect(transitionPublishRecordStatus("publishing", "failed")).toBe("failed");
    expect(transitionPublishRecordStatus("published", "withdrawn")).toBe("withdrawn");
    expect(transitionPublishRecordStatus("pending", "failed")).toBe("failed");
    expect(() => validatePublishRecordStatus("missing")).toThrow(ValidationError);
    expect(() => transitionPublishRecordStatus("published", "publishing")).toThrow(/invalid publish_record status transition/);
    expect(() => transitionPublishRecordStatus("failed", "published")).toThrow(/invalid publish_record status transition/);
  });

  it("builds a stable publish record snapshot", () => {
    expect(
      publishRecordSnapshot({
        id: "record-1",
        status: "published",
        channel: "wechat_mp",
        assetVersionId: "version-1",
        executionJobId: null,
        externalRef: "remote-1",
      }),
    ).toEqual({
      id: "record-1",
      status: "published",
      channel: "wechat_mp",
      asset_version_id: "version-1",
      execution_job_id: null,
      external_ref: "remote-1",
    });
  });
});

describe("PublisherChannel domain", () => {
  it("validates channel inputs", () => {
    expect(() =>
      validatePublisherChannel({
        key: "wechat_mp",
        display_name: "WeChat",
        endpoint_ref: "publisher://wechat",
        config: {},
      }),
    ).not.toThrow();
    expect(() => validatePublisherChannel({ key: " ", display_name: "WeChat" })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "Bad Key", display_name: "WeChat" })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "x".repeat(65), display_name: "WeChat" })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "wechat", display_name: " " })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "wechat", display_name: "x".repeat(161) })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "wechat", display_name: "WeChat", endpoint_ref: " " })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "wechat", display_name: "WeChat", endpoint_ref: "x".repeat(241) })).toThrow(ValidationError);
    expect(() => validatePublisherChannel({ key: "wechat", display_name: "WeChat", config: [] as never })).toThrow(ValidationError);
  });

  it("validates channel statuses and transitions", () => {
    expect(() => validatePublisherChannelStatus("active")).not.toThrow();
    expect(() => validatePublisherChannelStatus("missing")).toThrow(ValidationError);
    expect(() => assertPublisherChannelTransition("active", "active")).not.toThrow();
    expect(() => assertPublisherChannelTransition("active", "disabled")).not.toThrow();
    expect(() => assertPublisherChannelTransition("disabled", "active")).not.toThrow();
    expect(() => assertPublisherChannelTransition("disabled", "archived")).not.toThrow();
    expect(() => assertPublisherChannelTransition("archived", "active")).toThrow(InvalidTransitionError);
  });
});
