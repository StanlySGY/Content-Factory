#!/usr/bin/env bash
# Content Factory — 端到端验证：建一个 agent job，由 worker 驱动真实 Claude Code，结果落账本。
#
# 前提：另一个终端已用 scripts/run-hybrid-api.sh 启动 API。
# 用法：bash scripts/verify-local-cli-agent.sh ["你的 prompt"]
set -euo pipefail

API="${CF_API_BASE:-http://localhost:3001}"
PROMPT="${1:-用一句话介绍 PostgreSQL}"
IDEMPOTENCY_KEY="local-cli-verify-$(date +%s)"

command -v jq >/dev/null 2>&1 || { echo "✗ 需要 jq（sudo apt install jq）" >&2; exit 1; }

echo "▸ 1/4 健康检查 ${API}/api/health"
curl -fsS "${API}/api/health" | jq . || { echo "✗ API 未就绪，请先运行 scripts/run-hybrid-api.sh" >&2; exit 1; }

# credential_ref 在执行层用作 provider 选择器：provider=claude_code 即路由到 LocalCliAgentRuntime。
# keyRef 必须是引用形态（env://），但本地 CLI 凭继承环境调用，不真正解析此 keyRef。
echo "▸ 2/4 创建 agent job（provider=claude_code）"
CREATE_BODY=$(jq -n --arg p "$PROMPT" --arg k "$IDEMPOTENCY_KEY" '{
  type: "agent",
  idempotency_key: $k,
  payload: {
    prompt: $p,
    credential_ref: { provider: "claude_code", keyRef: "env://LOCAL_CLI_PLACEHOLDER", scope: "system" }
  }
}')
JOB=$(curl -fsS -X POST "${API}/api/execution/jobs" -H 'content-type: application/json' -d "$CREATE_BODY")
JOB_ID=$(echo "$JOB" | jq -r '.id')
echo "  job_id=${JOB_ID}  status=$(echo "$JOB" | jq -r '.status')"

# worker 已开启会自动领取；这里再显式 tick 一次确保立即执行（幂等：已被领取则返回当前态）。
echo "▸ 3/4 触发执行（tick）——真实调用 Claude Code，可能需数秒到数分钟"
curl -fsS -X POST "${API}/api/execution/jobs/${JOB_ID}/tick" >/dev/null 2>&1 || true

echo "▸ 4/4 轮询结果账本（最多 5 分钟）"
for i in $(seq 1 150); do
  JOB_NOW=$(curl -fsS "${API}/api/execution/jobs/${JOB_ID}")
  STATUS=$(echo "$JOB_NOW" | jq -r '.status')
  if [[ "$STATUS" == "success" || "$STATUS" == "failed" ]]; then
    echo "  最终 job 状态：${STATUS}"
    echo "▸ 结果账本 /api/execution/jobs/${JOB_ID}/results"
    RESULTS=$(curl -fsS "${API}/api/execution/jobs/${JOB_ID}/results")
    echo "$RESULTS" | jq '.[0] | {status, error_type, duration_ms, provider: .response_snapshot.output.provider, text: .response_snapshot.output.result.text}'
    if [[ "$STATUS" == "success" ]]; then
      echo
      echo "✓ 端到端打通：Claude Code 产出已落 execution_results。"
    else
      echo
      echo "✗ job 失败。完整结果见上方 error_type；常见原因：claude 未登录 / gate 未开 / 超时。" >&2
      exit 1
    fi
    exit 0
  fi
  sleep 2
done
echo "✗ 超时未出最终态（job 仍为 ${STATUS}）。确认 worker 已开启、claude 能在终端直接跑通。" >&2
exit 1
