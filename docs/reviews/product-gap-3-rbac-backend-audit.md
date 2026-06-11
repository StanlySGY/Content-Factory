# Product Gap 3 — Multi-tenant RBAC Backend MVP（审计）

> 范围：新增多租户 RBAC 后端最小控制面，为后续团队协作、项目级权限和审计加固提供基础模型。
> 一句话目标：**让系统具备组织、组织成员、项目成员关系和项目权限检查能力，但暂不替换现有默认 actor/project 上下文，也不全局强制拦截既有业务 API。**

---

## 1. 落地范围

新增三张 RBAC 表：

- `organizations`
- `organization_members`
- `project_memberships`

新增后端模块：

- `domain/rbac/rbac.ts`
- `application/rbac.service.ts`
- `infrastructure/repositories/rbac.repository.ts`
- `interfaces/http/routes/rbac.ts`

新增共享契约：

- Organization / OrganizationMember / ProjectMembership DTO
- create organization / add organization member / update organization member / grant project membership request schema
- project access check query / response schema

---

## 2. 架构边界

```text
HTTP /api/rbac/*
  -> RbacService
    -> RBAC Domain Rules
    -> RbacRepository
      -> organizations
      -> organization_members
      -> project_memberships
```

本阶段没有修改：

- Workflow / Review / Agent / MCP / Execution 状态机
- 现有业务 API 的权限拦截行为
- 默认 `buildContext()` 的 actor/project 语义
- audit hash chain
- execution plane

---

## 3. 权限模型

项目权限仅支持 MVP 三类：

| Permission | viewer | editor | owner |
| --- | --- | --- | --- |
| `project.read` | yes | yes | yes |
| `project.write` | no | yes | yes |
| `project.admin` | no | no | yes |

组织成员角色用于组织控制面：

- `owner`
- `admin`
- `member`
- `viewer`

项目成员角色用于项目授权：

- `owner`
- `editor`
- `viewer`

---

## 4. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/rbac/organizations` | 创建 organization，并为当前 actor 自动 seed owner membership |
| `GET` | `/api/rbac/organizations/:id/members` | 列出组织成员 |
| `POST` | `/api/rbac/organizations/:id/members` | 添加组织成员 |
| `PATCH` | `/api/rbac/organization-members/:id` | 更新组织成员 role/status |
| `POST` | `/api/rbac/organization-members/:id/deactivate` | 停用组织成员 |
| `POST` | `/api/rbac/projects/:id/memberships` | 授予项目成员关系 |
| `POST` | `/api/rbac/project-memberships/:id/revoke` | 撤销项目成员关系 |
| `GET` | `/api/rbac/projects/:id/check-access?user_id=&permission=` | 检查用户是否拥有指定项目权限 |

---

## 5. 关键行为

- 创建 organization 时，同事务创建 creator 的 `owner` organization membership。
- 重复 organization member 通过 `(organization_id, user_id)` 唯一约束返回 `409`。
- 重复 project membership 通过 `(project_id, organization_member_id)` 唯一约束返回 `409`。
- `check-access` 在无 active membership 时返回 `{ allowed: false, role: null }`，不抛权限异常。
- project access check 只看 active organization member + active project membership。
- revoked project membership 不再授予权限。

---

## 6. 原阶段非目标与后续增量

- 原阶段未覆盖前端 UI；后续已补齐 Web `/rbac` 成员与项目授权管理。
- 原阶段未覆盖全局业务 API RBAC enforcement；后续已补齐 header-based session context 与全局项目业务 API `project.read/write` enforcement。
- 原阶段未替换当前默认 actor/project context；后续已允许 `x-cf-actor-id` / `x-cf-project-id` 覆盖默认上下文，同时保留无 header 的默认种子兼容。
- 仍未新增生产 session/auth/token 体系。
- 不改 Sprint-4 Control Plane。
- 不改 Workflow / Review / Agent / MCP / Execution 状态机。
- 不把 RBAC 事件接入 audit hash chain，本阶段仅建控制面。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| RBAC enforcement middleware | 已补齐：全局项目业务 API 按 method 接入 `project.read/write` |
| RBAC audit hardening | organization/member/project membership 变更写入 audit |
| Auth/session integration | 已补齐 header-based session context；生产登录态 / IdP 和 session lifecycle 仍待接入 |
| Organization project ownership | 建立组织与项目的归属/绑定模型 |
| UI | 已补齐 Web `/rbac` 成员与项目授权管理；权限检查界面仍可按产品需要扩展 |

---

## 8. 验证

新增集成测试：

- `apps/api/test/integration/product-gap-3-rbac-api.test.ts`

覆盖：

- organization 创建并 seed owner membership
- organization member 添加、更新、停用
- project membership 授权、权限检查、撤销
- duplicate organization member / duplicate project grant 返回 `409`
- revoked 后权限检查返回 denied
