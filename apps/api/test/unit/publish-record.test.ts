import { describe, expect, it } from "vitest";
import {
  transitionPublishRecordStatus,
  validateCreatePublishRecord,
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
    expect(() => validateCreatePublishRecord({ ...valid, asset_version_id: "" })).toThrow(/asset_version_id/);
    expect(() => validateCreatePublishRecord({ ...valid, channel: "" })).toThrow(/channel/);
  });

  it("allows only deterministic status transitions", () => {
    expect(transitionPublishRecordStatus("pending", "publishing")).toBe("publishing");
    expect(transitionPublishRecordStatus("publishing", "published")).toBe("published");
    expect(transitionPublishRecordStatus("publishing", "failed")).toBe("failed");
    expect(transitionPublishRecordStatus("published", "withdrawn")).toBe("withdrawn");
    expect(() => transitionPublishRecordStatus("published", "publishing")).toThrow(/invalid publish_record status transition/);
    expect(() => transitionPublishRecordStatus("failed", "published")).toThrow(/invalid publish_record status transition/);
  });
});
