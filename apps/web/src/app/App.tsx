import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../lib/auth.js";
import { AppShell } from "../components/AppShell.js";
import { AgentDetailPage } from "../features/agents/AgentDetailPage.js";
import { AgentListPage } from "../features/agents/AgentListPage.js";
import { AgentSessionDetailPage } from "../features/agents/AgentSessionDetailPage.js";
import { NewAgentPage } from "../features/agents/NewAgentPage.js";
import { AssetComparePage } from "../features/assets/AssetComparePage.js";
import { AssetDetailPage } from "../features/assets/AssetDetailPage.js";
import { AssetsPage } from "../features/assets/AssetsPage.js";
import { ContextPacksPage } from "../features/context-packs/ContextPacksPage.js";
import { DashboardPage } from "../features/dashboard/DashboardPage.js";
import { NotFoundPage } from "../features/errors/NotFoundPage.js";
import { AgentEvaluationDashboardPage } from "../features/evaluations/AgentEvaluationDashboardPage.js";
import { EditorPage } from "../features/editor/EditorPage.js";
import { ExecutionOverviewPage } from "../features/execution/ExecutionOverviewPage.js";
import { ExecutionOutboxLedgerPage } from "../features/execution-outbox/ExecutionOutboxLedgerPage.js";
import { ExecutionResultLedgerPage } from "../features/execution-results/ExecutionResultLedgerPage.js";
import { ExecutionWritebackLedgerPage } from "../features/execution-writebacks/ExecutionWritebackLedgerPage.js";
import { KnowledgeCandidateReviewPage } from "../features/knowledge-candidates/KnowledgeCandidateReviewPage.js";
import { KnowledgeInventoryPage } from "../features/knowledge/KnowledgeInventoryPage.js";
import { ToolInvocationLedgerPage } from "../features/mcp-invocations/ToolInvocationLedgerPage.js";
import { McpMarketplaceManagementPage } from "../features/mcp-marketplace/McpMarketplaceManagementPage.js";
import { McpManagementPage } from "../features/mcp/McpManagementPage.js";
import { AgentRealAdapterRegistrationGuardPage } from "../features/ops/AgentRealAdapterRegistrationGuardPage.js";
import { AgentRealHttpAdapterReadinessPage } from "../features/ops/AgentRealHttpAdapterReadinessPage.js";
import { AgentProviderConfigPreflightPage } from "../features/ops/AgentProviderConfigPreflightPage.js";
import { AgentProviderTransportDisabledHarnessPage } from "../features/ops/AgentProviderTransportDisabledHarnessPage.js";
import { OpsMonitoringPage } from "../features/ops/OpsMonitoringPage.js";
import { OpsReadinessPage } from "../features/ops/OpsReadinessPage.js";
import { ProductRouteReadinessPage } from "../features/ops/ProductRouteReadinessPage.js";
import { ProviderHttpBoundaryPage } from "../features/ops/ProviderHttpBoundaryPage.js";
import { ProviderQuotaCostPreflightPage } from "../features/ops/ProviderQuotaCostPreflightPage.js";
import { SecretInjectionPreflightPage } from "../features/ops/SecretInjectionPreflightPage.js";
import { SecretResolverReadinessPage } from "../features/ops/SecretResolverReadinessPage.js";
import { PublisherWorkbenchPage } from "../features/publisher/PublisherWorkbenchPage.js";
import { RbacManagementPage } from "../features/rbac/RbacManagementPage.js";
import { PendingReviewsPage } from "../features/reviews/PendingReviewsPage.js";
import { ReviewQueuePage } from "../features/reviews/ReviewQueuePage.js";
import { StageRunDetailPage } from "../features/stage-runs/StageRunDetailPage.js";
import { NewTaskPage } from "../features/tasks/NewTaskPage.js";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage.js";
import { TaskListPage } from "../features/tasks/TaskListPage.js";
import { WorkQueuePage } from "../features/work-queue/WorkQueuePage.js";
import { WorkflowRunsPage } from "../features/workflow-runs/WorkflowRunsPage.js";
import { NewWorkflowPage } from "../features/workflows/NewWorkflowPage.js";
import { WorkflowDetailPage } from "../features/workflows/WorkflowDetailPage.js";
import { WorkflowListPage } from "../features/workflows/WorkflowListPage.js";

export function App() {
  return (
    <AuthProvider>
      <AppShell>
        <Routes>
        {/* 重定向：兼容旧 URL */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/content/tasks" element={<Navigate to="/tasks" replace />} />
        <Route path="/content/tasks/new" element={<Navigate to="/tasks/new" replace />} />
        <Route path="/content/tasks/:id" element={<Navigate to="/tasks/:id" replace />} />
        <Route path="/agents" element={<Navigate to="/settings/agents" replace />} />
        <Route path="/knowledge" element={<Navigate to="/settings/knowledge" replace />} />
        <Route path="/mcp" element={<Navigate to="/settings/mcp" replace />} />
        <Route path="/reviews" element={<Navigate to="/admin/reviews" replace />} />
        <Route path="/reviews/pending" element={<Navigate to="/admin/reviews/pending" replace />} />
        <Route path="/work-queue" element={<Navigate to="/admin/work-queue" replace />} />
        <Route path="/execution/results" element={<Navigate to="/admin/execution/results" replace />} />
        <Route path="/execution/outbox" element={<Navigate to="/admin/execution/outbox" replace />} />
        <Route path="/execution/writebacks" element={<Navigate to="/admin/execution/writebacks" replace />} />
        <Route path="/evaluations" element={<Navigate to="/admin/evaluations" replace />} />
        <Route path="/rbac" element={<Navigate to="/admin/rbac" replace />} />
        <Route path="/publisher" element={<Navigate to="/admin/publisher" replace />} />
        <Route path="/ops/*" element={<Navigate to="/admin/ops" replace />} />

        {/* 核心路由 */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* 任务中心 */}
        <Route path="/tasks" element={<TaskListPage />} />
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/tasks/:taskId/workflow-runs" element={<WorkflowRunsPage />} />
        <Route path="/tasks/:taskId/context-packs" element={<ContextPacksPage />} />
        <Route path="/tasks/:id/editor" element={<EditorPage />} />

        {/* 工作流 */}
        <Route path="/workflows" element={<WorkflowListPage />} />
        <Route path="/workflows/new" element={<NewWorkflowPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />

        {/* 素材中心（独立） */}
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/assets/:id/compare" element={<AssetComparePage />} />

        {/* 设置模块 */}
        <Route path="/settings/agents" element={<AgentListPage />} />
        <Route path="/settings/agents/new" element={<NewAgentPage />} />
        <Route path="/settings/agents/:id" element={<AgentDetailPage />} />
        <Route path="/settings/knowledge" element={<KnowledgeInventoryPage />} />
        <Route path="/settings/knowledge/candidates" element={<KnowledgeCandidateReviewPage />} />
        <Route path="/settings/mcp" element={<McpManagementPage />} />
        <Route path="/settings/workflows" element={<WorkflowListPage />} />

        {/* 管理后台模块 */}
        <Route path="/admin/reviews" element={<ReviewQueuePage />} />
        <Route path="/admin/reviews/pending" element={<PendingReviewsPage />} />
        <Route path="/admin/work-queue" element={<WorkQueuePage />} />
        <Route path="/admin/execution" element={<ExecutionOverviewPage />} />
        <Route path="/admin/execution/results" element={<ExecutionResultLedgerPage />} />
        <Route path="/admin/execution/outbox" element={<ExecutionOutboxLedgerPage />} />
        <Route path="/admin/execution/writebacks" element={<ExecutionWritebackLedgerPage />} />
        <Route path="/admin/evaluations" element={<AgentEvaluationDashboardPage />} />
        <Route path="/admin/mcp" element={<McpManagementPage />} />
        <Route path="/admin/mcp/invocations" element={<ToolInvocationLedgerPage />} />
        <Route path="/admin/mcp/marketplace" element={<McpMarketplaceManagementPage />} />
        <Route path="/admin/rbac" element={<RbacManagementPage />} />
        <Route path="/admin/publisher" element={<PublisherWorkbenchPage />} />

        {/* 运维看板 */}
        <Route path="/admin/ops" element={<OpsMonitoringPage />} />
        <Route path="/admin/ops/readiness" element={<OpsReadinessPage />} />
        <Route path="/admin/ops/product-routes" element={<ProductRouteReadinessPage />} />
        <Route path="/admin/ops/monitoring" element={<OpsMonitoringPage />} />
        <Route path="/admin/ops/provider-quota" element={<ProviderQuotaCostPreflightPage />} />
        <Route path="/admin/ops/agent-provider-config" element={<AgentProviderConfigPreflightPage />} />
        <Route path="/admin/ops/agent-provider-transport" element={<AgentProviderTransportDisabledHarnessPage />} />
        <Route path="/admin/ops/provider-http-boundary" element={<ProviderHttpBoundaryPage />} />
        <Route path="/admin/ops/agent-registration-guard" element={<AgentRealAdapterRegistrationGuardPage />} />
        <Route path="/admin/ops/agent-real-http-adapter" element={<AgentRealHttpAdapterReadinessPage />} />
        <Route path="/admin/ops/secret-resolver" element={<SecretResolverReadinessPage />} />
        <Route path="/admin/ops/secret-injection" element={<SecretInjectionPreflightPage />} />

        {/* 独立页面（深链） */}
        <Route path="/stage-runs/:id" element={<StageRunDetailPage />} />
        <Route path="/agent-sessions/:id" element={<AgentSessionDetailPage />} />

        {/* 404 页面 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
    </AuthProvider>
  );
}
