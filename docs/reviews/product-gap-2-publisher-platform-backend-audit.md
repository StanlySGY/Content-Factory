# Product Gap 2 — Publisher Platform Backend MVP（审计）

> 范围：补齐 Publisher Platform 的后端最小控制面。
> 结论：本阶段新增项目级发布渠道配置，并让 `publish_records` 创建前校验渠道处于 `active`。不做 UI、不新增真实发布网络行为、不做完整多渠道运营编排。

---

## 1. 阶段定位

| 项 | 结论 |
| --- | --- |
| 路线名 | Product Gap 2：Publisher Platform Backend MVP |
| 是否继续 P2.x | 否 |
| 前端 UI | 不做 |
| 外部发布调用 | 不新增 |
| 多渠道运营编排 | 不做 |
| Workflow / Review / Agent / MCP 状态机 | 不改 |

---

## 2. 架构图

```text
HTTP API
  /api/publisher/channels/*
    -> PublisherChannelService
       -> domain/publisher/channel.ts
       -> publisher-channel.repository.ts
       -> publisher_channels

HTTP API
  /api/publish-records
    -> PublishRecordService
       -> PublisherChannelService.ensureActiveChannel()
       -> publish_records
```

`publisher_channels` 是控制面配置表；真实发布仍由既有 `PublisherRealRuntime` 在显式 gate 下处理。

---

## 3. 新增数据模型

| 表 | 用途 |
| --- | --- |
| `publisher_channels` | 项目级发布渠道配置 |

关键约束：

- `project_id + key` 唯一。
- `key` 仅允许小写字母、数字、`_`、`:`、`-`，且首字符为小写字母或数字。
- `status` 仅允许 `active | disabled | archived`。
- `config` 必须为 JSON object。
- 默认 seed 当前 MVP 项目的 `wechat_mp`，保持既有 publish record API 兼容。

---

## 4. 状态机

```text
active -> disabled
active -> archived
disabled -> active
disabled -> archived
archived -> terminal
```

`archived` 是终态，不能恢复为 `active`。

---

## 5. API

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `POST` | `/api/publisher/channels` | 创建发布渠道 |
| `GET` | `/api/publisher/channels?status=` | 列出当前项目发布渠道 |
| `GET` | `/api/publisher/channels/:id` | 获取发布渠道 |
| `PATCH` | `/api/publisher/channels/:id` | 更新名称、endpoint_ref、config、status |
| `POST` | `/api/publisher/channels/:id/disable` | 禁用渠道 |
| `POST` | `/api/publisher/channels/:id/archive` | 归档渠道 |

错误语义：

| 场景 | 状态码 |
| --- | --- |
| 输入不合法 | 400 |
| channel 不存在 | 404 |
| channel key 重复 | 409 |
| 非法状态流转 | 409 |
| 创建 publish record 时 channel 非 active | 409 |

---

## 6. Publish Record 联动

`POST /api/publish-records` 新增前置校验：

1. 按当前项目查找 `publisher_channels.key = channel`。
2. 不存在返回 404。
3. 非 `active` 返回 409。
4. 通过后按原有逻辑写入 `publish_records`。

此联动只约束新建发布准备记录，不修改已有记录，也不回写 Workflow / Review 状态。

---

## 7. 边界

| 模块 | 是否改动 |
| --- | --- |
| PublisherRealRuntime | 否 |
| Execution worker | 否 |
| Workflow 状态机 | 否 |
| Review 状态机 | 否 |
| Agent / MCP 状态机 | 否 |
| UI | 否 |

本阶段不新增真实网络调用，真实发布仍由既有 gated runtime 控制。

---

## 8. 测试覆盖

新增集成测试：

```text
apps/api/test/integration/product-gap-2-publisher-platform-api.test.ts
```

覆盖：

- 创建 / 列表 / 详情 publisher channel。
- 同项目 channel key 唯一。
- disabled / archived channel 阻止新建 publish record。
- archived 终态不可恢复。
- seed `wechat_mp` 保持既有 publish record API 兼容。

回归覆盖：

- `productization-p2-2-publish-records-api.test.ts`
- `productization-p2-2-publisher-real-runtime-api.test.ts`

---

## 9. 非目标

- 不做 Publisher UI。
- 不做素材管理。
- 不做撤回执行。
- 不做失败告警。
- 不做多渠道运营编排。
- 不新增真实发布外部调用。
- 不改 Workflow / Review / Agent / MCP 状态机。

---

## 10. 后续路线

| 路线 | 内容 |
| --- | --- |
| Publisher UI | 渠道管理、发布准备列表、发布记录详情 |
| Channel Policy | 渠道级审批、风险确认、凭证引用策略 |
| Asset Packaging | 按渠道生成素材包、校验尺寸/格式/正文规则 |
| Withdraw / Retry Ops | 撤回、失败重试、人工确认 |
| Multi-channel Orchestration | 跨渠道排期、批量发布、状态看板 |
