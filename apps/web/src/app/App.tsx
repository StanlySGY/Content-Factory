import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell.js";
import { EmptyState } from "../components/states.js";
import { AssetsPage } from "../features/assets/AssetsPage.js";
import { ContextPacksPage } from "../features/context-packs/ContextPacksPage.js";
import { DashboardPage } from "../features/dashboard/DashboardPage.js";
import { NewTaskPage } from "../features/tasks/NewTaskPage.js";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage.js";
import { TaskListPage } from "../features/tasks/TaskListPage.js";
import { WorkflowRunsPage } from "../features/workflow-runs/WorkflowRunsPage.js";
import { NewWorkflowPage } from "../features/workflows/NewWorkflowPage.js";
import { WorkflowDetailPage } from "../features/workflows/WorkflowDetailPage.js";
import { WorkflowListPage } from "../features/workflows/WorkflowListPage.js";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/content/tasks" element={<TaskListPage />} />
        <Route path="/content/tasks/new" element={<NewTaskPage />} />
        <Route path="/content/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/tasks/:taskId/workflow-runs" element={<WorkflowRunsPage />} />
        <Route path="/tasks/:taskId/context-packs" element={<ContextPacksPage />} />
        <Route path="/workflows" element={<WorkflowListPage />} />
        <Route path="/workflows/new" element={<NewWorkflowPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route
          path="*"
          element={<EmptyState title="页面不存在" hint="请从左侧导航进入。" />}
        />
      </Routes>
    </AppShell>
  );
}
