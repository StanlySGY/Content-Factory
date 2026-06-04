# Spike-001 执行结果（Raw Result）

> 类型：Spike 原始执行记录（事实层，不含裁决）
> 日期：2026-06-04
> 设计依据：`docs/spikes/spike-001-claude-adapter.md`
> 执行方式：Claude Code **CLI headless**（`claude -p`）真实调用；scratch 工作目录 `/tmp/spike-001`（不提交）
> 说明：本文件记录原始命令与输出证据；分析见 `spike-001-review.md`，裁决见 `docs/reviews/spike-001-audit-package.md`。

## 1. 环境

| 项 | 值 |
| --- | --- |
| Node | v22.19.0 |
| npm | 11.7.0 |
| Claude Code CLI | 2.1.162 |
| OS | Linux 6.6.114.1-microsoft-standard-WSL2（WSL2）|
| 模型 | `claude-haiku-4-5-20251001`（显式指定）|
| 鉴权 | 订阅 OAuth（`ANTHROPIC_API_KEY` 未设置）|
| Agent SDK | **未使用**（本次走 CLI 路径；SDK 路径仍为设计态，未验证）|

## 2. 执行序列与原始证据

### 2.1 鉴权冒烟（含一处真实失败）

**调用 1（默认模型，失败）**：`claude -p "Reply with exactly one word: pong" --output-format json`

```json
{"type":"result","subtype":"success","is_error":true,"api_error_status":400,
"result":"API Error: 400 {\"error\":\"1m 上下文已经全量可用，请启用 1m 上下文后重试\"...}",
"session_id":"05922086-77f1-426a-9d01-2fb1c11ea724","total_cost_usd":0}
```
→ 鉴权通过（返回结构化 JSON + 生成 session_id），但默认模型（opus-4-8[1m]）因 1M 上下文配置返回 **API 400**。

**调用 2（Haiku，成功）**：追加 `--model claude-haiku-4-5-20251001`

```json
{"type":"result","is_error":false,"result":"pong",
"session_id":"f78b2df7-4029-4d79-83a2-5fc7b28fc1f4","total_cost_usd":0.0486,
"modelUsage":{"claude-haiku-4-5-20251001":{"contextWindow":200000}}}
```
→ exit=0，`result:"pong"`。**覆盖能力 1（Prompt）/2（Response）/3（Session Create）**。

### 2.2 能力 4：Session Resume（跨进程记忆测试）

**轮 A**：`claude -p "Remember the number 42. Reply with exactly: OK" --output-format json --model claude-haiku-4-5-20251001`
```json
{"is_error":false,"result":"OK","session_id":"3543e26a-feb0-4d57-a11d-ed2b43dbff9b","total_cost_usd":0.0512}
```

**轮 B（独立新进程）**：`claude -p "What number did I ask you to remember? ..." --resume 3543e26a-... --output-format json --model claude-haiku-4-5-20251001`
```json
{"is_error":false,"result":"42","session_id":"3543e26a-feb0-4d57-a11d-ed2b43dbff9b","total_cost_usd":0.0505}
```
→ resume 返回**同一 session_id**，`result:"42"`。**上下文跨进程保留，能力 4 验证成功**。

### 2.3 能力 6：Streaming（stream-json）

`claude -p "Count from 1 to 3, one number per line." --output-format stream-json --verbose --model claude-haiku-4-5-20251001`

14 个流式事件（每行一个 JSON）：

| 行 | type / subtype |
| --- | --- |
| 1-2 | system/hook_started, hook_response |
| 3 | system/**init**（携带 session_id）|
| 4-6 | system/**api_retry** ×3 |
| 7-11 | system/thinking_tokens ×5 |
| 12-13 | **assistant**（增量输出）|
| 14 | **result**/success，`result:"1\n2\n3"` |

→ 流式增量事件成功送达，最终 result 正确。**能力 6 验证成功**。观察：出现 3 次 `api_retry`（瞬时，自动恢复）。

### 2.4 能力 5：消息历史检索

会话 transcript 持久化路径（Claude Code 自身存储）：
`~/.claude/projects/-tmp-spike-001/3543e26a-feb0-4d57-a11d-ed2b43dbff9b.jsonl`

按序读取的 user/assistant 历史（跨两轮）：

```text
1: user      "Remember the number 42. Reply with exactly: OK"
2: assistant  (thinking, 空文本块)
3: assistant  "OK"
4: user      "What number did I ask you to remember? Reply with ..."
5: assistant  (thinking, 空文本块)
6: assistant  "42"
```
→ 历史完整、有序、可检索。**能力 5 验证成功**。历史由 Provider 端 JSONL 持久化。

## 3. 成本与性能

| 调用 | 结果 | 成本(USD) | 时延 |
| --- | --- | --- | --- |
| 冒烟(opus 默认) | 400 错误 | 0 | 1.2s |
| 冒烟(pong) | pong | 0.0486 | 58.4s |
| Resume 轮 A | OK | 0.0512 | 35.8s |
| Resume 轮 B | 42 | 0.0505 | 23.5s |
| Streaming | 1\n2\n3 | 0.0478 | — |
| **合计（成功 4 次）** | | **≈ 0.198** | |

> 每次 ~$0.05、首次 ~58s：均因自动加载 ~38–40k token 上下文（全局/项目 CLAUDE.md 自动发现 + 缓存创建）。非 prompt 本身开销（input_tokens 仅 10）。

## 4. 能力验证小结（事实层）

| # | 能力 | 命令证据 | 结果 |
| --- | --- | --- | --- |
| 1 | Prompt | 调用 2 / 轮 A | 成功送达 |
| 2 | Response | result=pong/OK/42 | 成功返回 |
| 3 | Session Create | session_id 生成（多次）| 成功 |
| 4 | Session Resume | 轮 B resume → "42" | 成功（跨进程）|
| 5 | History | transcript JSONL 6 条有序 | 成功 |
| 6 | Streaming | stream-json 14 事件 | 成功 |

> scratch 日志位于 `/tmp/spike-001/*.json|*.jsonl`（不提交）；关键证据已内嵌本文件。
