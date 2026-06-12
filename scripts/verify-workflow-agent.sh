#!/usr/bin/env bash
# Content Factory — 端到端验证：工作流阶段引用 Claude Code agent 触发执行。
#
# 与 verify-local-cli-agent.sh 的区别：那个直接建 job；这个走「工作流→执行层」正向桥
#   POST /api/stage-runs/:id/request-execution（带 agent_profile_id），
#   从 Agent 管理页里那个自动种子的 Claude Code profile 解析 provider，
#   真正验证本次工作流接入。
#
# 前提：另一个终端已用 scripts/run-hybrid-api.sh 启动 API（含 auto-seed）。
# 用法：bash scripts/verify-workflow-agent.sh ["你的 prompt"]
set -euo pipefail

API="${CF_API_BASE:-http://localhost:3001}"
PROMPT="${1:-用一句话介绍 PostgreSQL}"
# stage_run_id 为任意 UUID：该路由不校验 stage_run 是否存在，仅作 subject 标识。
STAGE_RUN_ID="$(cat /proc/sys/kernel/random/uuid)"
IDEMPOTENCY_KEY="workflow-agent-verify-$(date +%s)"

command -v jq >/dev/null 2>&1 || { echo "✗ 需要 jq（sudo apt install jq）" >&2; exit 1; }

echo "▸ 1/5 健康检查 ${API}/api/health"
curl -fsS "${API}/api/health" | jq . || { echo "✗ API 未就绪，请先运行 scripts/run-hybrid-api.sh" >&2; exit 1; }

echo "▸ 2/5 从 /api/agents 查找自动种子的 Claude Code profile"
AGENTS=$(curl -fsS "${API}/api/agents")
PROFILE_ID=$(echo "$AGENTS" | jq -r '.[] | select(.constraints.provider == "claude_code") | .id' | head -n1)
if [[ -z "$PROFILE_ID" || "$PROFILE_ID" == "null" ]]; then
  echo "✗ 未找到 provider=claude_code 的 agent profile。" >&2
  echo "  确认 run-hybrid-api.sh 启动后日志出现 'local cli agent discovery complete'，且种子成功。" >&2
  echo "  当前 agents：" >&2
  echo "$AGENTS" | jq -r '.[] | "  - \(.name) (provider=\(.constraints.provider // "none"))"' >&2
  exit 1
fi
echo "  agent_profile_id=${PROFILE_ID}"

echo "▸ 3/5 工作流阶段请求执行（POST /api/stage-runs/${STAGE_RUN_ID}/request-execution）"
REQ_BODY=$(jq -n --arg pid "$PROFILE_ID" --arg p "$PROMPT" --arg k "$IDEMPOTENCY_KEY" '{
  agent_profile_id: $pid,
  prompt: $p,
  idempotency_key: $k
}')
JOB=$(curl -fsS -X POST "${API}/api/stage-runs/${STAGE_RUN_ID}/request-execution" \
  -H 'content-type: application/json' -d "$REQ_BODY")
JOB_ID=$(echo "$JOB" | jq -r '.id')
echo "  job_id=${JOB_ID}  status=$(echo "$JOB" | jq -r '.status')"

echo "▸ 4/5 触发执行（tick）——真实调用 Claude Code，可能需数秒到数分钟"
curl -fsS -X POST "${API}/api/execution/jobs/${JOB_ID}/tick" >/dev/null 2>&1 || true

echo "▸ 5/5 轮询结果账本（最多 5 分钟）"
for i in $(seq 1 150); do
  STATUS=$(curl -fsS "${API}/api/execution/jobs/${JOB_ID}" | jq -r '.status')
  if [[ "$STATUS" == "success" || "$STATUS" == "failed" ]]; then
    echo "  最终 job 状态：${STATUS}"
    RESULTS=$(curl -fsS "${API}/api/execution/jobs/${JOB_ID}/results")
    echo "$RESULTS" | jq '.[0] | {status, error_type, duration_ms, provider: .response_snapshot.output.provider, text: .response_snapshot.output.result.text}'
    if [[ "$STATUS" == "success" ]]; then
      echo
      echo "✓ 工作流接入打通：阶段引用 Claude Code agent → 真实产出已落 execution_results。"
    else
      echo
      echo "✗ job 失败。见上方 error_type；常见原因：claude 未登录 / gate 未开 / 超时。" >&2
      exit 1
    fi
    exit 0
  fi
  sleep 2
done
echo "✗ 超时未出最终态（job 仍为 ${STATUS}）。确认 worker 已开启。" >&2
exit 1
