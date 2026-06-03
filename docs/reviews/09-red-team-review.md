# 09 红队审查

> 状态：已完成　|　最近更新：2026-06-03　|　规则：[00-review-master.md](./00-review-master.md)

## 1. 审查对象

- 全部设计文档的跨域安全与对抗性视角
- 重点：`docs/00-project/project-constitution.md`、`docs/02-architecture/system-architecture.md`（§13/§14/§15）、`docs/04-agent/agent-architecture.md`（§9.4/§12/§19）、`docs/05-mcp/mcp-architecture.md`、`docs/03-database/database-design.md`（§5.18/§11）

## 2. 审查目标

以攻击者视角审查设计的安全边界、权限、数据保护、外部接入与审计完整性，发现可被滥用的薄弱点。

## 3. 审查清单

- [x] 密钥与凭证：无明文存储（仅引用，§13.3/§14.3）
- [x] Agent 原生工具沙箱（§9.4 已治理）
- [x] 破坏性操作需强确认（机制在，但确认完整性见 RT-002）
- [ ] 注入风险：Prompt 注入 / 外部内容注入信任边界（RT-001）
- [ ] 人工确认防伪与绑定（RT-002）
- [ ] 审计完整性：防篡改 / 防删除技术控制（RT-003）
- [ ] 服务身份与凭证最小化 / 轮换（RT-004）
- [ ] 第三方插件供应链与运行时隔离（RT-005）
- [ ] 跨项目隔离强制点（RT-006）
- [ ] 敏感数据传播控制与脱敏管道（RT-007/008）
- [ ] WSL 路径沙箱逃逸边界（RT-009）
- [ ] 远端 MCP 传输安全（RT-010）

## 4. 发现的问题

| ID | 级别 | 类型 | 问题 | 位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| RT-001 | Major | 提示注入 | Output Validator / Result Normalizer 仅校验结构，未防间接提示注入；外部抓取内容入 context_packs/messages 被下游消费，无数据/指令分离 | agent §8/§9, mcp §9.3, arch §10.2 | 已修复 |
| RT-002 | Major | 授权完整性 | 高风险人工确认未与 (tool_id, input_digest, risk_level, stage_run_id) 绑定，热加载下存在 TOCTOU/旧授权复用 | mcp §8.4, arch §11.3 | 已修复 |
| RT-003 | Major | 审计完整性 | "禁止删除审计"仅策略约束，audit_events 为普通表，无追加写/哈希链/WORM/权限分离；脱敏依赖调用方自觉 | db §5.18/§11, agent §19 | 已修复 |
| RT-004 | Major | 凭证/身份 | 服务身份签发/轮换机制未定义；后端集中持有凭证管理为单点高价值目标，爆炸半径无控制 | arch §13.1/§14.3, agent §12.4 | 已修复 |
| RT-005 | Major | 供应链 | 插件侧缺来源/签名/摘要校验与升级重评估；runtime=process 无进程沙箱强制项（不对称于 §9.4）；插件可经 PluginRuntime 调 MCP 构成提权 | arch §5, mcp §11.4, 宪法 | 已修复 |
| RT-006 | Major | 隔离 | 跨项目隔离仅应用层约定，无 RLS/强制 project_id 谓词；含敏感快照的 tool_invocations/agent_messages 未在 schema 绑定 project_id | arch §13.3, db 全表 | 已修复 |
| RT-007 | Minor | 数据保护 | context_packs.sensitivity_level 脱敏靠写入方自觉，sensitive 上下文到 Provider（含外部 Codex/Gemini）的传播控制未定义 | db §5.8/§9.3 | 待修复 |
| RT-008 | Minor | 数据保护 | input_digest/脱敏无算法与不可逆要求，敏感值可能在摘要中残留 | mcp §9.2/§9.3, db §5.17 | 待修复 |
| RT-009 | Minor | 沙箱逃逸 | WSL 路径转换与工作目录沙箱交叉处（符号链接、`..`、`/mnt/c`、UNC）规范化与逃逸防护未明确 | agent §12.2/§9.4 | 待修复 |
| RT-010 | Minor | 传输安全 | 远端/HTTP/SSE MCP 未要求 TLS 与服务端身份校验，远端调用可能明文传输 | mcp §5.2/§6.1, db §5.13 | 待修复 |

## 5. 修复建议

- **RT-001**：ContextPack/Message 引入来源可信级别（trusted/untrusted）标记并隔离呈现；外部抓取内容不得入 system/指令通道；高风险工具调用授权不得由 Agent 自由文本驱动，须编排器策略校验。
- **RT-002**：确认令牌绑定 (tool_id, input_digest, risk_level, stage_run_id) 且短时效；执行前重校验摘要一致，否则重新授权；audit_event 记录被确认内容摘要。
- **RT-003**：审计仅追加 + 序列号/前序哈希链；审计存储与业务库权限/实例分离；统一脱敏中间件作为日志/审计写入的强制管道。
- **RT-004**：服务身份采用短时效令牌 + 按 Session 范围下发；凭证管理与后端主进程信任边界隔离（独立进程/外部 vault）；凭证签发审计与速率限制。
- **RT-005**：插件补齐与第三方 MCP 对称的供应链治理（来源/摘要/签名/风险分级/升级差异重评估）；明确 runtime=process 插件进程级沙箱强制项，与 §9.4 对齐。
- **RT-006**：DB 层启用 RLS 或强制 project_id 谓词访问层；敏感快照表显式携带并约束 project_id；增加跨项目访问自动化测试与告警。
- **RT-007~010**：按 sensitivity_level 定义到 Provider 的传播矩阵 + ContextBuilder 强制脱敏；定义统一脱敏标准与 digest 约束；WSL 路径规范化与白名单根校验；远端/HTTP 传输强制 TLS 与端点身份校验。

## 6. 最终结论

有条件通过 —— 设计层"默认拒绝 + 最小权限 + 强制沙箱 + 密钥仅引用"框架方向正确，无 Critical；但提示注入信任边界（RT-001）、人工确认完整性（RT-002）、审计防篡改（RT-003）、服务身份/凭证最小化（RT-004）、插件供应链（RT-005）、跨项目隔离强制点（RT-006）等 Major 控制须在实现前补全设计并定义强制点。

## 7. 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | 红队 / 安全评审 | 完成审查 | 0 Critical / 6 Major / 4 Minor；结论有条件通过 |
| 2026-06-03 | 修复跟踪 | 批次 8 修复 | RT-001~006（6 Major）→ 已修复；注入隔离/确认绑定/审计防篡改/凭证最小化/插件供应链/跨项目隔离强制点已落地；详见 fix-log 批次 8 |
