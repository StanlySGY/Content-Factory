# 前端重构计划：多页面架构

> 生成时间：2026-06-13  
> 方案：层级路由 + 折叠侧边栏（方案 A）  
> 目标：解决信息过载，分离用户/管理功能，降低认知负荷

---

## 📋 执行摘要

**核心变更：**
1. 路由重组：50+ 扁平路由 → 5 大模块嵌套路由
2. 导航重构：37+ 链接侧边栏 → 分组折叠导航（主导航 5 项）
3. 角色分离：普通用户工作区 vs 管理后台独立区域

**技术栈：**
- React Router v6（已安装，利用 Outlet 嵌套）
- 现有组件逻辑 100% 复用，零重写
- 新增：折叠组件、路由重定向、面包屑导航

**交付物：**
- [ ] 新路由结构（`App.tsx`）
- [ ] 分组导航组件（`SidebarNav.tsx` 重构）
- [ ] 重定向规则（兼容旧 URL）
- [ ] 折叠状态持久化（localStorage）

---

## 🗺️ 新路由架构

### 模块 1：工作台（Dashboard）
```
/ → 重定向到 /dashboard
/dashboard - DashboardPage（现有组件，保持不变）
```

**职责：**任务概览、快速创建入口、最近历史、待审提醒

### 模块 2：任务中心（Tasks）
```
/tasks - TaskListPage
/tasks/new - NewTaskPage
/tasks/:id - TaskDetailPage
  ├─ /tasks/:id/workflow-runs - WorkflowRunsPage
  ├─ /tasks/:id/context-packs - ContextPacksPage
  └─ /tasks/:id/editor - EditorPage
```

**保留现有：** `/content/tasks` → 重定向到 `/tasks`

### 模块 3：工作流（Workflows）
```
/workflows - WorkflowListPage
/workflows/new - NewWorkflowPage
/workflows/:id - WorkflowDetailPage
```

**无变化，保持现有路由**

### 模块 4：设置（Settings）- 新增聚合页
```
/settings - SettingsPage（新建，Tab 容器）
  ├─ /settings/agents - 嵌入 AgentListPage + NewAgentPage
  ├─ /settings/knowledge - 嵌入 KnowledgeInventoryPage
  ├─ /settings/mcp - 嵌入 McpManagementPage
  └─ /settings/workflows - 嵌入 WorkflowListPage（快捷入口）
```

**迁移映射：**
- `/agents` → `/settings/agents`
- `/knowledge` → `/settings/knowledge`
- `/mcp` → `/settings/mcp`

### 模块 5：管理后台（Admin）
```
/admin - AdminDashboard（新建，概览页）
  ├─ /admin/reviews - PendingReviewsPage + ReviewQueuePage
  ├─ /admin/execution - 执行日志聚合页（新建）
  │   ├─ /admin/execution/results
  │   ├─ /admin/execution/outbox
  │   └─ /admin/execution/writebacks
  ├─ /admin/ops - OpsMonitoringPage（入口）
  │   ├─ /admin/ops/readiness
  │   ├─ /admin/ops/provider-quota
  │   └─ ... (10+ ops 子页面)
  ├─ /admin/mcp - MCP 管理聚合
  │   ├─ /admin/mcp/invocations
  │   └─ /admin/mcp/marketplace
  └─ /admin/rbac - RbacManagementPage
```

**迁移映射：**
- `/reviews` → `/admin/reviews`
- `/execution/*` → `/admin/execution/*`
- `/ops/*` → `/admin/ops/*`
- `/rbac` → `/admin/rbac`

### 保留独立页面
```
/assets - AssetsPage（素材中心，跨场景）
/stage-runs/:id - StageRunDetailPage（工作流详情深链）
/agents/:id - AgentDetailPage（从设置页跳转）
/agent-sessions/:id - AgentSessionDetailPage
/publisher - PublisherWorkbenchPage（特殊工具）
```

---

## 🧭 导航结构

### 主导航（SidebarNav - 5 项）
```
⚙ Content Factory
├─ 📊 工作台 (/dashboard)
├─ 📝 任务 (/tasks)
├─ 🔄 工作流 (/workflows)
├─ ⚙️ 设置 (/settings) [可折叠]
│   ├─ Agent 管理
│   ├─ 知识库
│   ├─ MCP 工具
│   └─ 工作流模板
└─ 🔧 管理后台 (/admin) [可折叠]
    ├─ 审核队列
    ├─ 执行日志
    ├─ 运维看板
    ├─ MCP 管理
    └─ 权限管理
```

**折叠行为：**
- 默认收起"设置"和"管理后台"
- 点击展开/收起，状态存储到 `localStorage.getItem('nav-collapsed')`
- 当前路由匹配时自动展开对应分组

### 面包屑导航（可选增强）
```
工作台 > 任务 > 任务详情 #123
管理后台 > 执行日志 > 结果账本
```

---

## 🛠️ 实施步骤

### Step 1：创建折叠导航组件
**文件：** `apps/web/src/components/CollapsibleNavGroup.tsx`

```typescript
interface Props {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  storageKey: string;
  children: ReactNode;
}
```

**功能：**
- 点击标题切换展开/收起
- localStorage 持久化状态
- 路由匹配时自动展开

### Step 2：重构 SidebarNav.tsx
**变更：**
- 顶层 5 个 NavLink：工作台、任务、工作流、设置、管理后台
- "设置"和"管理后台"用 `CollapsibleNavGroup` 包裹
- 二级链接作为 children 传入

**示例结构：**
```tsx
<nav className="sidebar">
  <div className="brand">⚙ Content Factory</div>
  <NavLink to="/dashboard">📊 工作台</NavLink>
  <NavLink to="/tasks">📝 任务</NavLink>
  <NavLink to="/workflows">🔄 工作流</NavLink>
  
  <CollapsibleNavGroup title="⚙️ 设置" storageKey="nav-settings">
    <NavLink to="/settings/agents">Agent 管理</NavLink>
    <NavLink to="/settings/knowledge">知识库</NavLink>
    <NavLink to="/settings/mcp">MCP 工具</NavLink>
  </CollapsibleNavGroup>
  
  <CollapsibleNavGroup title="🔧 管理后台" storageKey="nav-admin">
    <NavLink to="/admin/reviews">审核队列</NavLink>
    <NavLink to="/admin/execution">执行日志</NavLink>
    <NavLink to="/admin/ops">运维看板</NavLink>
    <NavLink to="/admin/mcp">MCP 管理</NavLink>
    <NavLink to="/admin/rbac">权限管理</NavLink>
  </CollapsibleNavGroup>
</nav>
```

### Step 3：重组 App.tsx 路由
**变更点：**
1. 添加路由重定向（兼容旧 URL）
2. 嵌套路由结构（`/admin/*`、`/settings/*`）
3. 保持现有组件引用不变

**关键代码：**
```tsx
<Routes>
  {/* 重定向 */}
  <Route path="/" element={<Navigate to="/dashboard" replace />} />
  <Route path="/content/tasks" element={<Navigate to="/tasks" replace />} />
  <Route path="/agents" element={<Navigate to="/settings/agents" replace />} />
  
  {/* 核心路由 */}
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/tasks" element={<TaskListPage />} />
  <Route path="/tasks/new" element={<NewTaskPage />} />
  <Route path="/tasks/:id" element={<TaskDetailPage />} />
  
  {/* 嵌套：设置 */}
  <Route path="/settings">
    <Route index element={<SettingsPage />} />
    <Route path="agents" element={<AgentListPage />} />
    <Route path="knowledge" element={<KnowledgeInventoryPage />} />
    <Route path="mcp" element={<McpManagementPage />} />
  </Route>
  
  {/* 嵌套：管理后台 */}
  <Route path="/admin">
    <Route index element={<AdminDashboard />} />
    <Route path="reviews" element={<PendingReviewsPage />} />
    <Route path="execution">
      <Route index element={<ExecutionLogsOverview />} />
      <Route path="results" element={<ExecutionResultLedgerPage />} />
      <Route path="outbox" element={<ExecutionOutboxLedgerPage />} />
      <Route path="writebacks" element={<ExecutionWritebackLedgerPage />} />
    </Route>
    <Route path="ops">
      <Route index element={<OpsMonitoringPage />} />
      <Route path="readiness" element={<OpsReadinessPage />} />
      {/* ... 其他 ops 子页面 */}
    </Route>
  </Route>
</Routes>
```

### Step 4：新建聚合页面
**必需：**
- `apps/web/src/features/settings/SettingsPage.tsx` - Tab 容器，链接到 agents/knowledge/mcp
- `apps/web/src/features/admin/AdminDashboard.tsx` - 管理后台概览（待审数量、执行统计、运维状态）
- `apps/web/src/features/admin/ExecutionLogsOverview.tsx` - 执行日志聚合入口

**结构：**
```tsx
// SettingsPage.tsx
export function SettingsPage() {
  return (
    <div>
      <h1>设置</h1>
      <div className="settings-grid">
        <Link to="/settings/agents" className="card">
          <h2>Agent 管理</h2>
          <p>配置 AI Agent 实例</p>
        </Link>
        <Link to="/settings/knowledge" className="card">
          <h2>知识库</h2>
          <p>管理项目知识</p>
        </Link>
        <Link to="/settings/mcp" className="card">
          <h2>MCP 工具</h2>
          <p>工具集成配置</p>
        </Link>
      </div>
    </div>
  );
}
```

### Step 5：样式调整
**文件：** `apps/web/src/styles.css`

**新增类：**
```css
/* 折叠组样式 */
.nav-group {
  margin: 0.5rem 0;
}

.nav-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}

.nav-group-header:hover {
  background: var(--bg-hover);
}

.nav-group-icon {
  transition: transform 0.2s;
}

.nav-group.open .nav-group-icon {
  transform: rotate(90deg);
}

.nav-group-children {
  padding-left: 1rem;
  border-left: 2px solid var(--border);
  margin-left: 1rem;
}

.nav-group-children a {
  font-size: 0.9rem;
}
```

### Step 6：测试验证
**检查项：**
- [ ] 所有旧 URL 正确重定向到新 URL
- [ ] 折叠状态在刷新后保持
- [ ] 当前路由高亮正确
- [ ] 嵌套路由（/admin/ops/readiness）正常渲染
- [ ] 移动端侧边栏响应式收起

---

## ⚠️ 风险缓解

### 1. URL 变更影响书签
**方案：** 全量重定向规则（Step 3 已包含）

**额外：** 在 `DashboardPage` 顶部添加临时提示：
```tsx
{hasOldBookmarks && (
  <InfoBar message="导航已升级！部分页面路径有调整，建议更新书签。" />
)}
```

### 2. 权限控制缺失
**现状检查：** 查询现有 RBAC 实现是否支持路由级权限

**临时方案：** 前端隐藏 `/admin` 入口（localStorage.role !== 'admin'）

**长期方案：** 后端 API 强制权限校验 + 前端路由守卫

### 3. 折叠状态同步
**场景：** 用户在 A 标签页展开"设置"，B 标签页未同步

**方案：** 使用 `window.addEventListener('storage')` 监听 localStorage 变化

### 4. 移动端体验
**问题：** 侧边栏在小屏占满屏幕

**方案：** 添加 Hamburger 菜单，侧边栏改为 Drawer 模式（可后续优化）

---

## 📊 影响评估

**文件变更：**
- 修改：`App.tsx`（路由重组）
- 修改：`SidebarNav.tsx`（导航分组）
- 新建：`CollapsibleNavGroup.tsx`（3 个组件）
- 新建：`SettingsPage.tsx`、`AdminDashboard.tsx`、`ExecutionLogsOverview.tsx`

**代码行数：**
- 新增：~200 行
- 修改：~150 行
- 删除：~0 行（仅重组，不删除）

**兼容性：**
- ✅ 现有组件逻辑零改动
- ✅ 后端 API 零改动
- ✅ 测试套件无需调整（组件单测不涉及路由）

---

## ✅ 验收标准

1. **导航层级**：主导航 ≤5 项 ✅
2. **折叠功能**：设置和管理后台可折叠，状态持久化 ✅
3. **快速访问**：创建任务 ≤2 次点击（工作台 → 快速创建 or 任务 → 新建）✅
4. **角色分离**：`/admin` 路由独立，普通用户不可见（需权限系统配合）⚠️
5. **兼容性**：旧 URL 自动重定向，无 404 ✅

---

**计划完成。准备进入 Phase 4（执行）？**
