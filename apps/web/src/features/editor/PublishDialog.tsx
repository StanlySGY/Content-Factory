import { useState } from "react";
import type { PublisherChannelDTO } from "@cf/shared";
import { ErrorBar } from "../../components/states.js";
import { usePublisherChannels, usePublishVersion } from "../publisher/hooks.js";
import "./publish-dialog.css";

interface PublishDialogProps {
  assetId: string;
  versionId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PublishDialog({ assetId, versionId, onClose, onSuccess }: PublishDialogProps) {
  const { data: channels, isLoading, isError, error } = usePublisherChannels();
  const publishMutation = usePublishVersion();
  const [selectedChannel, setSelectedChannel] = useState<string>("");

  const activeChannels = channels?.filter((c) => c.status === "active") ?? [];

  const handlePublish = () => {
    if (!selectedChannel || !assetId || !versionId) return;

    publishMutation.mutate(
      {
        assetId,
        body: {
          version_id: versionId,
        },
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      },
    );
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog publish-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>发布到渠道</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="dialog-body">
          {publishMutation.isError && (
            <ErrorBar message={`发布失败：${(publishMutation.error as Error).message}`} />
          )}

          {isError && (
            <ErrorBar message={`加载渠道失败：${(error as Error).message}`} />
          )}

          {isLoading ? (
            <div className="loading-hint">加载渠道中...</div>
          ) : activeChannels.length === 0 ? (
            <div className="empty-hint">
              <p>暂无可用发布渠道</p>
              <p className="hint-text">请先在发布工作台配置渠道</p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="publish-channel">选择发布渠道</label>
                <select
                  id="publish-channel"
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  disabled={publishMutation.isPending}
                >
                  <option value="">-- 请选择 --</option>
                  {activeChannels.map((channel) => (
                    <option key={channel.id} value={channel.key}>
                      {channel.display_name} ({channel.key})
                    </option>
                  ))}
                </select>
              </div>

              <div className="publish-info">
                <div className="info-row">
                  <span className="info-label">资产 ID：</span>
                  <code className="info-value">{assetId.slice(0, 8)}...</code>
                </div>
                <div className="info-row">
                  <span className="info-label">版本 ID：</span>
                  <code className="info-value">{versionId.slice(0, 8)}...</code>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn" onClick={onClose} disabled={publishMutation.isPending}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={handlePublish}
            disabled={
              !selectedChannel ||
              publishMutation.isPending ||
              isLoading ||
              activeChannels.length === 0
            }
          >
            {publishMutation.isPending ? "发布中..." : "确认发布"}
          </button>
        </div>
      </div>
    </div>
  );
}
