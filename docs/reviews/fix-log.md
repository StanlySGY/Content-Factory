# Fix Log

记录所有按 [review-backlog.md](./review-backlog.md) 执行的修复。每条含：修复时间、问题编号、修改内容、影响范围。Backlog 为问题权威源，本文件为修复留痕。

## 批次 1（2026-06-03）

聚焦 Critical 与高优先 Major（1 Critical + 4 Major）。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | AGENT-001 (Critical) | 新增 §9.4「原生工具治理」（沙箱边界、文件权限按 Provider 降级、命令白名单、网络隔离、运行时强制、审计）；§9.1 Built-in 行注明不经 Tool Router、受 §9.4 约束；修正 §9.3 消除与 §9.1 的矛盾 | `docs/04-agent/agent-architecture.md` §9.1 / §9.3 / §9.4；落实宪法与全局沙箱约束（Codex/Gemini 强制只读）；与 ARCH-004、AGENT-007 运行时治理相关联 |
| 2026-06-03 | AGENT-002 (Major) | §9.2 调用链路图与 §11.1 集成图改为 MCP 经 MCP Gateway；§11.2 原则改为 MCP Bridge 仅适配、统一经 Gateway 施加权限/风险/审计/标准化 | `docs/04-agent/agent-architecture.md` §9.2 / §11.1 / §11.2；与 `docs/05-mcp/mcp-architecture.md` 网关隔离原则对齐 |
| 2026-06-03 | AGENT-003 (Major) | §6 重构为 Profile 生命周期与 执行(Session) 生命周期两个平面的概览，词表对齐 §16.1 / §16.2，移除混淆 Profile 与 Session 的单一状态图 | `docs/04-agent/agent-architecture.md` §6；交叉引用 §13 ~ §16 |
| 2026-06-03 | ARCH-002 (Major) | §2 高层架构图新增 `Repository 接口` 节点，`Domain → DB` 改为 `Domain → Repository → DB`，并补依赖方向说明 | `docs/02-architecture/system-architecture.md` §2；与 §4.2 依赖倒置一致 |
| 2026-06-03 | ARCH-001 (Major) | §13 后续细化链接更正为实际文件名（database-design / agent-architecture / mcp-architecture / content-workflow），未创建文档标注「待创建」 | `docs/02-architecture/system-architecture.md` §13。说明：README「典型文档」列为示例性命名（非硬链接），按文档约定保留，不在本次修正范围 |

### 批次小结

- 修复 5 项：1 Critical + 4 Major。
- 未修复 Critical：1 → 0；未修复 High：24 → 20。
- 同源死链簇（PROD-009 / AGENT-012 / DB-020）尚未处理，留待后续批次统一修复。

## 批次 2（2026-06-03）

聚焦数据库 Major（数据正确性 + 工作流持久化 + 核心表缺失），共 5 个 Major，集中于 `docs/03-database/database-design.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | DB-002 (Major) | §5.8 context_packs 唯一键按 scope 拆分：task 级 `(content_task_id, scope, version)`、stage 级 `(stage_run_id, scope, version)`，以部分唯一索引实现并约束 stage_run_id 与 scope 的对应关系；§9.3 同步说明 | `docs/03-database/database-design.md` §5.8 / §9.3；消除同任务跨阶段共享版本号的键歧义 |
| 2026-06-03 | DB-008 (Major) | §5.9 content_assets 增 `current_version_id` 外键指向 asset_versions，§5.10 前补充互引用延迟约束说明，current_version 整数降级为展示冗余；ER 字段块与 §9.2 同步 | `docs/03-database/database-design.md` §3 ER / §5.9 / §5.10 / §9.2；保证当前版本引用完整性 |
| 2026-06-03 | DB-012 (Major) | 新增 §5.5.1 workflow_stage_dependencies 表承载并行/分支/DAG 依赖（含 dependency_type、condition_schema、无环校验）；§5.5 加 position 仅线性序说明；§5.4 definition_schema 不再作为依赖权威；ER 与 §7.2 索引同步 | `docs/03-database/database-design.md` §3 ER / §5.4 / §5.5 / §5.5.1 / §7.2；解决依赖只存 JSON |
| 2026-06-03 | DB-013 (Major) | §5.7 stage_runs 增 `parent_stage_run_id`（回滚血缘）、`parallel_group`（并行分组）、`gate_result`（门禁结果快照），补约束说明并声明门禁结果与 review_records 不冲突；ER 字段块同步 | `docs/03-database/database-design.md` §3 ER / §5.7；支撑回滚、并行与门禁持久化 |
| 2026-06-03 | DB-004 (Major) | 新增 §5.19~§5.23：agent_sessions（含 provider_session_ref）、agent_messages、publish_records（锚定 asset_version）、mcp_installations、mcp_config_versions；ER 关系与 §7.2 索引同步 | `docs/03-database/database-design.md` §3 ER / §5.19~§5.23 / §7.2；填补 Session/Message、发布、MCP 生命周期核心表 |

### 批次小结

- 修复 5 项：5 Major（DB 域）。已修复累计 5 → 10；未修复 High 20 → 15；未修复 Critical 保持 0。
- 关联说明：DB-004 已落地 agent_sessions/agent_messages（含 provider_session_ref），AGENT-004 仅剩 `docs/04-agent` §18 映射与 §7.1 字段对齐，留待后续批次；publish_records 已为 DB-009「已发布版本权威指针」提供结构，待 Minor 批次正式关闭。
- 工作流持久化簇（DB-012 / DB-013）已修复，余 DB-006（运行绑定配置快照）待后续批次。

## 批次 3（2026-06-03）

聚焦「运行时 / WSL / 认证」跨域簇与核心表簇收尾，共 5 个 Major，跨 `system-architecture.md` 与 `agent-architecture.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | ARCH-003 (Major) | 新增 §13「身份与访问控制」：认证边界（统一认证、服务身份）、授权模型（项目级 + 预留 RBAC 接缝呼应 DB-005）、资源隔离（强制 project_id、密钥只存引用） | `docs/02-architecture/system-architecture.md` §13 |
| 2026-06-03 | ARCH-004 (Major) | 新增 §14「运行时与部署拓扑」：运行时组成、Agent 执行宿主（本地/WSL/远端）、密钥凭证边界，并配拓扑图；衔接 Agent §12 与 §9.4 | `docs/02-architecture/system-architecture.md` §14；联动 AGENT-007 |
| 2026-06-03 | ARCH-005 (Major) | 新增 §15「并发与一致性」：并发场景、领域状态机 + 乐观锁 + 单事务、幂等键与失败恢复；原「后续细化文档」顺延为 §16 | `docs/02-architecture/system-architecture.md` §15 / §16（编号顺延） |
| 2026-06-03 | AGENT-007 (Major) | 新增 §12.4「执行宿主与密钥边界」：宿主显式声明、跨边界安全注入、WSL 凭证隔离、失败语义 | `docs/04-agent/agent-architecture.md` §12.4；与架构 §14 一致 |
| 2026-06-03 | AGENT-004 (Major) | §7.1 Session 字段补 `provider_session_ref`；§18 数据模型映射对齐批次 2 已落地的 `agent_sessions`（§5.19）/`agent_messages`（§5.20），状态值对齐 §16.2 | `docs/04-agent/agent-architecture.md` §7.1 / §18；与 `database-design.md` 形成闭环 |

### 批次小结

- 修复 5 项：5 Major。已修复累计 10 → 15；未修复 High 15 → 10；未修复 Critical 保持 0。
- 簇闭环：「运行时/WSL/认证」（ARCH-003/004/005 + AGENT-007）与「核心表缺失」（AGENT-004 + DB-004）两个跨域簇均已修复。
- 架构文档新增三个顶层小节后，「后续细化文档」由 §13 顺延至 §16；§1~§12 编号不变，其余未修复项对旧编号的引用不受影响。

## 批次 4（2026-06-03）

聚焦产品域全部 Major，共 5 个，集中于 `docs/01-product/product-requirements.md`，全部以追加子节方式落地，零既有编号顺延。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | PROD-001 (Major) | 新增 §2.3「量化成功指标」：北极星周成稿数 + 任务完成率/一次通过率/修订轮次/端到端周期等，过程可追溯率与扩展达成设为硬性约束 | `docs/01-product/product-requirements.md` §2.3 |
| 2026-06-03 | PROD-002 (Major) | 新增 §7.5「完成定义（DoD）与可测试验收」：统一 DoD + Given-When-Then 可测试用例（覆盖 P0~P2 关键功能） | `docs/01-product/product-requirements.md` §7.5 |
| 2026-06-03 | PROD-003 (Major) | 新增 §4.5「用户优先级与目标市场」：主/次要/支撑用户分级，声明 MVP 目标市场为公众号图文中文内容个人与小团队 | `docs/01-product/product-requirements.md` §4.5 |
| 2026-06-03 | PROD-004 (Major) | 新增 §3.2「竞品与差异化」：竞品类别对比表 + 五条差异化价值主张 | `docs/01-product/product-requirements.md` §3.2 |
| 2026-06-03 | PROD-005 (Major) | 新增 §6.12「发布与渠道管理」功能项：渠道配置、发布草稿、锚定 `publish_records` 版本、状态/重试/撤回、授权审计、插件化渠道 | `docs/01-product/product-requirements.md` §6.12；与 publish_records、发布阶段、公众号工作台对齐，消除一致性缺口 |

### 批次小结

- 修复 5 项：5 Major。已修复累计 15 → 20；未修复 High 10 → 5；未修复 Critical 保持 0。
- 产品域（PROD）Major 全部清零；PROD-005 通过补 PRD 发布功能项消除与 07-workflow / 08-ui / 10-development 的一致性缺口。
- 剩余 5 个 Major 集中于扩展性与数据库：AGENT-005 / AGENT-006 / DB-001 / DB-006 / DB-016。

## 批次 5（2026-06-03）

清空全部剩余 Major（扩展性 + 数据库一致性/版本/插件），共 5 个，跨 `agent-architecture.md` 与 `database-design.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | AGENT-005 (Major) | 新增 §4.3「Adapter 注册与 Provider 标识」：AdapterRegistry 插件式注册、Provider 改开放字符串（非闭合枚举）、能力描述驱动；修正 §17 第 2 步 | `docs/04-agent/agent-architecture.md` §4.3 / §17 |
| 2026-06-03 | AGENT-006 (Major) | 新增 §4.4「能力匹配与 Agent 选择」：能力需求 → 候选筛选 → 优先级排序 → 回退策略 → 可解释，纳入审计 | `docs/04-agent/agent-architecture.md` §4.4 |
| 2026-06-03 | DB-001 (Major) | ER 将 audit_events 三条伪外键关系改为真实 FK（projects/users）；§5.18 补多态完整性说明（subject 多态不建外键，应用层校验） | `docs/03-database/database-design.md` §3 ER / §5.18 |
| 2026-06-03 | DB-006 (Major) | §5.19 agent_sessions 增 `profile_snapshot`；§9.4 改为强约束：运行记录必须绑定配置快照/版本（Agent 快照、MCP/插件版本表、invocation input_data） | `docs/03-database/database-design.md` §5.19 / §9.4 |
| 2026-06-03 | DB-016 (Major) | §5.16 plugin_definitions 增 runtime/entrypoint/dependency_schema/config_schema；新增 §5.24 plugin_installations、§5.25 plugin_config_versions；ER 与 §7.2 索引同步 | `docs/03-database/database-design.md` §5.16 / §5.24 / §5.25 / §3 ER / §7.2 |

### 批次小结

- 修复 5 项：5 Major。已修复累计 20 → 25；**未修复 Critical = 0、未修复 High（Major）= 0**。
- 四个已审查域（架构 / 产品 / Agent / 数据库）的 Critical 与 Major 全部清零，达成放行判据中的「未修复 Critical = 0、未修复 High = 0」。
- Backlog 剩余 27 项全部为 Minor；尚有 04 MCP / 06 工作流 / 07 UI / 08 MVP / 09 红队 / 10 终审 六个域待审查（问题待补充）。

## 批次 6（2026-06-03）

第二轮审查（04/06/07/08/09 + 10 终审）完成后进入第二轮修复。本批清除唯一 Critical 与 UI 核心模块缺口，共 1 Critical + 4 Major，集中于 `docs/08-ui/ui-design.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | UI-001 (Critical) | 新增 §22「实时更新通道」：SSE/WS 选型、订阅粒度(task/stage_run/session)、消息类型、断线重连与一致性 | ui §22；衔接 arch §14.1/§15.1 |
| 2026-06-03 | UI-002 (Major) | 新增 §23「工作流设计器」：模板/阶段编排画布/依赖/执行者绑定/门禁/版本；页面树加 workflows 路由 | ui §23/§3/§4 |
| 2026-06-03 | UI-003 (Major) | 新增 §24「Skill 与插件管理」：Skill 注册/门禁、插件安装/权限/依赖/失败策略；页面树加 skills/plugins | ui §24/§3/§4 |
| 2026-06-03 | UI-004 (Major) | 新增 §25「身份与访问」：认证/会话、成员与角色(呼应 DB-005)、项目隔离、权限页；settings 加 members/roles | ui §25/§4；衔接 arch §13 |
| 2026-06-03 | UI-005 (Major) | 新增 §26「发布与渠道管理」：渠道配置、发布记录锚定 publish_records 版本、审计、多渠道插件化；页面树加 channels | ui §26/§4；对齐 PRD §6.12 |

### 批次小结

- 修复 5 项：1 Critical + 4 Major。已修复累计 25 → 30；未修复 Critical 1→0、High（Major）26→22。
- 原 §22 禁止事项、§23 后续细化文档顺延为 §27、§28；§1~§21 编号不变，内部引用不受影响。
- UI 域剩 UI-006（模块映射表）、UI-007（错误态补全）两个 Major 及 4 个 Minor 待后续批次。

## 批次 7（2026-06-03）

第二轮修复第二批，聚焦工作流 WF 域全部 5 个 Major 并顺带关闭强耦合的 WF-006，集中于 `docs/07-workflow/content-workflow.md`，联动 `docs/03-database/database-design.md` 字段。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | WF-001 (Major) | §4.2 阶段状态机移除 `failed --> skipped`，`skipped` 入边对齐 DB §8.3（仅 `pending --> skipped`），补失败仅可重试/终止/退回的说明 | wf §4.2 ↔ db §8.3 |
| 2026-06-03 | WF-002 (Major) | §4.1 标注为业务阶段视图（非状态机权威），补 `terminated` 状态并映射 DB §8.2，明确审查 `approved/revision_required/rejected/terminated` 业务落点 | wf §4.1 ↔ db §8.2/§8.4 |
| 2026-06-03 | WF-003 (Major) | 新增 §5.4「重试与重做判定」：区分同 run 原地重试（`attempt_count++`，技术失败）与跨 run 重做（新建 `stage_run`+`parent_stage_run_id`，业务退回/回滚）；DB §5.7 措辞同步消除"重试"血缘二义 | wf §5.4；db §5.7 |
| 2026-06-03 | WF-004 (Major) | 新增 §5.5「回滚的下游影响」：下游资产 `stale` 失效 + 重算、已发布走修正、分叉血缘经 parent 链 + `source_stage_run_id`；DB 联动 `content_assets.status` 增 `stale`、`asset_versions` 增 `source_stage_run_id`（含 ER） | wf §5.5/§6.3；db §3 ER/§5.9/§5.10 |
| 2026-06-03 | WF-005 (Major) | §7.3 隐式「汇总上下文」提升为显式「汇聚阶段(join)」；新增 §7.5「并行汇聚语义」：join_all/join_any、部分失败、gate_result 聚合，对齐 DB §5.5.1 `dependency_type` 与 §5.7 `parallel_group` | wf §7.3/§7.5 ↔ db §5.5.1/§5.7 |
| 2026-06-03 | WF-006 (Minor) | §9 数据映射更新：发布记录指向已落地的 `publish_records`，补 `workflow_stage_dependencies`、`agent_sessions/agent_messages` 映射 | wf §9 |

### 批次小结

- 修复 6 项：5 Major + 1 Minor。已修复累计 30 → 36；未修复 Critical 保持 0、High（Major）22 → 17、Minor 49 → 48。
- 工作流域（WF）全部 Major 清零；WF-006 因与本批引用强耦合（`publish_records`/`stage_dependencies`）一并关闭，避免 §9 映射与新增引用矛盾。
- DB 联动两处字段（`content_assets.status` 的 `stale`、`asset_versions.source_stage_run_id`）已同步 ER 与表说明，与 wf §5.4/§5.5 形成闭环。
- WF 域剩 WF-007/008/009/010 四个 Minor 待后续 Minor 批次。

## 批次 8（2026-06-03）

第二轮修复第三批，聚焦红队 RT 域全部 6 个 Major（跨域安全强制点），跨 `system-architecture.md`、`agent-architecture.md`、`mcp-architecture.md`、`database-design.md` 四文档。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | RT-001 (Major) | 数据/指令分离：agent §8.1 消息增 `trust_level`、§8.3 加外部内容 untrusted 与授权不由文本驱动原则；arch §10.2 数据边界图增「信任级标注与注入隔离」节点与说明；mcp §15.1 补外部内容 untrusted | agent §8.1/§8.3；arch §10.2；mcp §15.1 |
| 2026-06-03 | RT-002 (Major) | mcp §8.4 授权时序补「执行前重校验确认令牌」；新增确认令牌规则：绑定 (tool_id,input_digest,risk_level,stage_run_id)+短时效+执行前 digest 重校验，杜绝 TOCTOU | mcp §8.4 |
| 2026-06-03 | RT-003 (Major) | db §5.18 audit_events 增 `sequence_no`/`prev_hash`/`entry_hash`，约束补 append-only、哈希链防篡改、存储与权限分离 + 统一脱敏管道 | db §5.18 |
| 2026-06-03 | RT-004 (Major) | arch §13.1 加服务身份短时效令牌+按 Session 签发+轮换/吊销+审计；§14.3 加凭证管理与主进程信任边界隔离（独立进程/vault）、签发审计+速率限制，限制单点爆炸半径 | arch §13.1/§14.3 |
| 2026-06-03 | RT-005 (Major) | arch 新增 §5.3「插件供应链与沙箱治理」：来源/摘要/签名校验、升级重评估、runtime=process 进程沙箱强制（对齐 agent §9.4）、禁止经 PluginRuntime 绕网关提权 | arch §5.3 |
| 2026-06-03 | RT-006 (Major) | arch §13.3 加 DB 层 RLS/强制 project_id 谓词 + 敏感表绑 project_id + 跨项目测试告警；db tool/skill/plugin_invocations 与 agent_messages 增 `project_id` 并加 RLS 约束说明 | arch §13.3；db §5.17/§5.20 |

### 批次小结

- 修复 6 项：6 Major。已修复累计 36 → 42；未修复 Critical 保持 0、High（Major）17 → 11、Minor 48（不变）。
- 红队域（RT）全部 Major 清零；跨域安全强制点（注入隔离/确认绑定/审计防篡改/凭证最小化/插件供应链/跨项目隔离）已在设计层定义并落地强制点。
- DB 联动：audit_events 哈希链三字段、调用表与 agent_messages 的 project_id（RT-003/006）。
- RT 域剩 RT-007/008/009/010 四个 Minor（脱敏传播/digest 约束/WSL 路径/远端 TLS）待后续 Minor 批次。

## 批次 9（2026-06-03）

第二轮修复第四批，聚焦 MCP 域全部 4 个 Major，集中于 `docs/05-mcp/mcp-architecture.md`，联动 `docs/03-database/database-design.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | MCP-001 (Major) | §3 架构图加 `Result Normalizer` 节点并连入网关链路；§12 网关契约新增「标准调用结果」结构（success/failed/timeout/denied 同构 + digest/risk/duration） | mcp §3/§12 |
| 2026-06-03 | MCP-002 (Major) | db tool_invocations 补 caller_type/caller_id/risk_level/duration_ms，status 枚举补 denied/timeout；mcp §9.3 增 invocation/permission/lifecycle 日志落表映射 | db §5.17；mcp §9.3 |
| 2026-06-03 | MCP-003 (Major) | mcp §4 新增「生命周期状态 → 数据表字段映射」表，区分持久态（install_status/health_status/server.status）与运行瞬态 | mcp §4 ↔ db §5.13/§5.22 |
| 2026-06-03 | MCP-004 (Major) | §5.2 Manifest permissions 补 production/destructive/user_confirmation/context_scope 四维，声明与 §8.2 八维及 mcp_tools.permission_schema 对齐 | mcp §5.2 ↔ §8.2 |

### 批次小结

- 修复 4 项：4 Major。已修复累计 42 → 46；未修复 Critical 保持 0、High（Major）11 → 7、Minor 48（不变）。
- MCP 域全部 Major 清零；tool_invocations 与 MCP 调用日志字段/枚举闭环（caller/risk/duration），与跨域 DB-018 caller 维度诉求一致。
- MCP 域剩 MCP-005~008 四个 Minor（integrity 字段/MCPBridge 图/状态语义/市场日志表）待后续 Minor 批次。

## 批次 10（2026-06-03）

第二轮修复第五批，清除 UI 域剩余 2 个 Major，集中于 `docs/08-ui/ui-design.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | UI-006 (Major) | §3 新增「UI 模块与架构模块映射」表，将架构 §3.1 六模块（任务中心/工作流设计器/执行监控/审查工作台/资产库/配置中心）映射到承载页，消除命名漂移与执行监控/审查弱化 | ui §3 ↔ arch §3.1 |
| 2026-06-03 | UI-007 (Major) | §19 补「全局错误与加载态」表：401/403、网络超时、实时断连回退轮询、加载骨架、分页/加载失败、5xx 降级 | ui §19 |

### 批次小结

- 修复 2 项：2 Major。已修复累计 46 → 48；未修复 Critical 保持 0、High（Major）7 → 5、Minor 48（不变）。
- UI 域全部 Major 清零（UI-001~005 见批次 6，UI-006/007 本批）；同步修正批次 6 遗漏，07-ui-review 问题表 UI-001~007 状态对齐 backlog。
- UI 域剩 UI-008/009/010/011 四个 Minor 待后续 Minor 批次。
- 剩余仅 MVP 5 个 Major（MVP-001~005）。

## 批次 11（2026-06-03）

第二轮修复第六批（收官），清除 MVP 域全部 5 个 Major 并顺带关闭强耦合的 MVP-006，集中于 `docs/10-development/development-roadmap.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | MVP-001 (Major) | S2 §5.3 新增表加入 `workflow_stage_dependencies`，要求落地 finish_to_start 线性依赖 + 无环校验，承载"禁止跳阶段" | roadmap §5.3 ↔ db §5.5.1 |
| 2026-06-03 | MVP-002 (Major) | §5.3 写明 stage_runs.agent_profile_id 在 S2 仅留列、S4 建 agent_profiles 后补 FK，决策记入迁移说明 | roadmap §5.3 |
| 2026-06-03 | MVP-003 (Major) | §7.3 将 skill/plugin 四表移出 MVP（PRD §7.3 为 P2），收敛 S4 为 Agent Profile + MCP + 发布准备，skill/plugin 仅可空表占位不作验收 | roadmap §7.3 ↔ PRD §7 |
| 2026-06-03 | MVP-004 (Major) | §4.3 明确任务创建默认 draft、确认置 ready（对齐 PRD §7.5），流转归任务领域服务并要求 §4.6 单测/集成测试 | roadmap §4.3 ↔ PRD §7.5 |
| 2026-06-03 | MVP-005 (Major) | §3 Sprint 总览加估算列与串并行假设；§9 里程碑新增 MVP 出口门槛（可追溯率 100%、扩展零业务代码改动、§2.3 指标可采集）| roadmap §3/§9 ↔ PRD §2.3 |
| 2026-06-03 | MVP-006 (Minor) | §7.3 publish_records 由"可选/可替代"改为至少建表以锚定 asset_version_id，保证已发布版本不漂移 | roadmap §7.3 ↔ db §5.21 |

### 批次小结

- 修复 6 项：5 Major + 1 Minor。已修复累计 48 → 54；**未修复 Critical = 0、未修复 High（Major）= 0**；未修复 Minor 48 → 47。
- MVP 域全部 Major 清零；MVP-006 因与 MVP-003 同段强耦合一并关闭。
- **至此全部 10 域的 Critical 与 Major 全部清零**，达成放行判据「未修复 Critical = 0、未修复 High = 0」，可进入终审（10-final-review）复审。
- MVP 域剩 MVP-007/008/009/010 四个 Minor；全仓剩 47 项 Minor 均已排期、允许带入开发跟踪。

## 批次 12（2026-06-03）

Minor 清理第一批：架构域 5 个 Minor + 跨域命名簇 AGENT-008，集中于 `system-architecture.md`，联动 agent/mcp 命名统一。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | ARCH-006 (Minor) | §12 决策表加「全链路可观测」：统一关联 ID 贯穿日志/调用/审计/链路追踪 | arch §12 |
| 2026-06-03 | ARCH-007 (Minor) | §3.2 加前端实时通道原则（SSE/WS 回退轮询、订阅粒度、实时仅呈现），回链 ui §22 | arch §3.2 |
| 2026-06-03 | ARCH-008 / AGENT-008 (Minor) | 统一命名：arch §2 加组件命名说明（SkillRuntime 顶层 + SkillBridge 桥接，类比 MCP）；agent「Skill Bridge」→「SkillBridge」、§10.1 补单路径与 Skill 体系回链；mcp §3 图 SkillRuntime | arch §2；agent §3/§10；mcp §3 |
| 2026-06-03 | ARCH-009 (Minor) | §16 标注 Skill 体系（注册/契约/门禁）未设计，SkillRuntime/SkillBridge 为前置占位接口，待 06-skill 回链 | arch §16 |
| 2026-06-03 | ARCH-010 (Minor) | §2 图后说明 MCP 多调用方（Agent/Skill/Plugin/工作流）经 MCPGateway，高层图以编排层为代表，详见 mcp §14 | arch §2 |

### 批次小结

- 修复 6 项 Minor（ARCH-006~010 + AGENT-008）。已修复累计 54 → 60；未修复 Critical/Major 保持 0；Minor 47 → 41。
- 跨域命名漂移簇（ARCH-008/AGENT-008）一次闭合，全仓 Skill 命名统一为 SkillRuntime/SkillBridge，无残留旧写法。

## 批次 13（2026-06-03）

Minor 清理第二批：产品域 6 个 Minor，集中于 `product-requirements.md`。

| 修复时间 | 问题编号 | 修改内容 | 影响范围 |
| --- | --- | --- | --- |
| 2026-06-03 | PROD-006 (Minor) | §3.1 加「MVP 聚焦」：首要渠道公众号图文、首要内容类型 article，其余类型/渠道经可扩展机制延后 | prod §3.1 |
| 2026-06-03 | PROD-007 (Minor) | §5 新增 §5.7「异常与失败旅程」：质量不达标/反复退回/发布失败/合规风险/Agent 失败的预期行为 | prod §5.7 |
| 2026-06-03 | PROD-008 (Minor) | §9 新增 §9.6「合规、版权与数据」：合规门禁、素材授权可追溯、数据归属与留存策略 | prod §9.6 |
| 2026-06-03 | PROD-009 (Minor) | §11 死链校正为实际文件名（system-architecture/database-design/agent-architecture/mcp-architecture/content-workflow/ui-design），skill-registry/api-overview 标「待创建」 | prod §11 |
| 2026-06-03 | PROD-010 (Minor) | §7 开头加阶段术语映射：P0=§8.1 MVP=roadmap Sprint 1-4，P1/P2/P3=Alpha/Beta/生产化 | prod §7 |
| 2026-06-03 | PROD-011 (Minor) | §6.2 补需求结构化兜底：置信度标注 + 低置信/信息不足必提示缺失项并人工确认 | prod §6.2 |

### 批次小结

- 修复 6 项 Minor（PROD-006~011）。已修复累计 60 → 66；未修复 Critical/Major 保持 0；Minor 41 → 35。
- 产品域全部 11 项（5 Major + 6 Minor）清零；PROD-009 为死链同源簇成员，余 AGENT-012/DB-020 待后续批次闭合。
