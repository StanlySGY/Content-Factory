#!/usr/bin/env bash
# Content Factory — 混合模式启动 API（宿主机进程驱动本地 CLI Agent）
#
# 为什么是混合模式：本地 agentic CLI（Claude Code 等）装在宿主机，
# 其登录态在宿主 ~/.claude。容器内 PATH 看不到它，也读不到登录态。
# 所以 API 必须作为宿主机进程启动，spawn 子进程才能继承 PATH 与认证。
#
# 数据库：复用 .env 指向的 PostgreSQL（系统 PG 或 `pnpm db:up` 的容器均可），本脚本不碰库。
#
# gate 变量经 export 注入：server.ts 的 dotenv 不覆盖已存在的 process.env，
# 故这里 export 的开关不会被 .env 冲掉，.env 仍提供 DATABASE_URL 等基础配置。
#
# 用法：bash scripts/run-hybrid-api.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# 预检：至少有一个已知 CLI 在 PATH
found_any=false
for cmd in claude gemini codex opencode mimo; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "✓ 检测到 $cmd：$(command -v "$cmd")"
    found_any=true
  fi
done
if [ "$found_any" = false ]; then
  echo "✗ 未在 PATH 找到任何已知 CLI Agent（claude/gemini/codex/opencode/mimo）。" >&2
  exit 1
fi

# ── 本地 CLI Agent 真实执行 gate（全部显式开启）──
export EXECUTION_RUNTIME_MODE=real_enabled
export EXECUTION_RUNTIME_ADAPTER_MODE=real
export EXECUTION_ALLOW_REAL_RUNTIME=true
export EXECUTION_ALLOW_PROCESS_SPAWN=true
export EXECUTION_LOCAL_CLI_AGENT_ENABLED=true
export EXECUTION_LOCAL_CLI_AGENT_AUTO_SEED=true
export EXECUTION_LOCAL_CLI_AGENT_PROVIDERS=

# worker 必须开启，job 才会被自动领取执行
export EXECUTION_WORKER_ENABLED=true
export EXECUTION_WORKER_INTERVAL_MS=2000

# CLI 调用可能较慢（实测简单 prompt 5–17s，创作类更久），放宽运行时超时到 5 分钟
export EXECUTION_RUNTIME_TIMEOUT_MS=300000
export EXECUTION_RUNTIME_MAX_TIMEOUT_MS=300000
# 锁超时需 >= 运行时超时，否则长任务会被误判为 stale 而回退
export EXECUTION_WORKER_LOCK_TIMEOUT_MS=360000

echo "✓ gate 已注入，启动 API（宿主机进程，端口取 .env APP_PORT，默认 3001）"
echo "  本地 CLI Agent：enabled + auto-seed（扫描全注册表）"
echo "  worker：enabled（间隔 ${EXECUTION_WORKER_INTERVAL_MS}ms）"
echo "  按 Ctrl+C 停止。"
echo

exec pnpm dev:api
