import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewActions } from "../src/features/reviews/ReviewActions";

describe("ReviewActions", () => {
  it("点击「通过」回调 onApprove", async () => {
    const onApprove = vi.fn();
    const onRequestRevision = vi.fn();
    render(<ReviewActions onApprove={onApprove} onRequestRevision={onRequestRevision} />);
    await userEvent.click(screen.getByRole("button", { name: "通过" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onRequestRevision).not.toHaveBeenCalled();
  });

  it("填写目标后「退回修改」回调 onRequestRevision(target)", async () => {
    const onApprove = vi.fn();
    const onRequestRevision = vi.fn();
    render(<ReviewActions onApprove={onApprove} onRequestRevision={onRequestRevision} />);
    const revisionBtn = screen.getByRole("button", { name: "退回修改" });
    expect(revisionBtn).toBeDisabled(); // 无目标时禁用
    await userEvent.type(screen.getByLabelText("退回目标阶段"), "stage-9");
    await userEvent.click(revisionBtn);
    expect(onRequestRevision).toHaveBeenCalledWith("stage-9", "");
  });
});
