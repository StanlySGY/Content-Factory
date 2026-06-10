import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell.js";
import { EmptyState } from "../components/states.js";
import { AgentDetailPage } from "../features/agents/AgentDetailPage.js";
import { AgentListPage } from "../features/agents/AgentListPage.js";
import { AgentSessionDetailPage } from "../features/agents/AgentSessionDetailPage.js";
import { NewAgentPage } from "../features/agents/NewAgentPage.js";
import { AssetComparePage } from "../features/assets/AssetComparePage.js";
import { AssetDetailPage } from "../features/assets/AssetDetailPage.js";
import { AssetsPage } from "../features/assets/AssetsPage.js";
import { ContextPacksPage } from "../features/context-packs/ContextPacksPage.js";
import { DashboardPage } from "../features/dashboard/DashboardPage.js";
import { AgentEvaluationDashboardPage } from "../features/evaluations/AgentEvaluationDashboardPage.js";
import { EditorPage } from "../features/editor/EditorPage.js";
import { ExecutionOutboxLedgerPage } from "../features/execution-outbox/ExecutionOutboxLedgerPage.js";
import { ExecutionResultLedgerPage } from "../features/execution-results/ExecutionResultLedgerPage.js";
import { ExecutionWritebackLedgerPage } from "../features/execution-writebacks/ExecutionWritebackLedgerPage.js";
import { KnowledgeCandidateReviewPage } from "../features/knowledge-candidates/KnowledgeCandidateReviewPage.js";
import { KnowledgeInventoryPage } from "../features/knowledge/KnowledgeInventoryPage.js";
import { ToolInvocationLedgerPage } from "../features/mcp-invocations/ToolInvocationLedgerPage.js";
import { McpMarketplaceManagementPage } from "../features/mcp-marketplace/McpMarketplaceManagementPage.js";
import { McpManagementPage } from "../features/mcp/McpManagementPage.js";
import { AgentRealAdapterRegistrationGuardPage } from "../features/ops/AgentRealAdapterRegistrationGuardPage.js";
import { AgentProviderConfigPreflightPage } from "../features/ops/AgentProviderConfigPreflightPage.js";
import { AgentProviderTransportDisabledHarnessPage } from "../features/ops/AgentProviderTransportDisabledHarnessPage.js";
import { OpsMonitoringPage } from "../features/ops/OpsMonitoringPage.js";
import { OpsReadinessPage } from "../features/ops/OpsReadinessPage.js";
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
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/content/tasks" element={<TaskListPage />} />
        <Route path="/content/tasks/new" element={<NewTaskPage />} />
        <Route path="/content/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/tasks/:taskId/workflow-runs" element={<WorkflowRunsPage />} />
        <Route path="/tasks/:taskId/context-packs" element={<ContextPacksPage />} />
        <Route path="/tasks/:id/editor" element={<EditorPage />} />
        <Route path="/workflows" element={<WorkflowListPage />} />
        <Route path="/workflows/new" element={<NewWorkflowPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/assets/:id/compare" element={<AssetComparePage />} />
        <Route path="/reviews" element={<ReviewQueuePage />} />
        <Route path="/reviews/pending" element={<PendingReviewsPage />} />
        <Route path="/work-queue" element={<WorkQueuePage />} />
        <Route path="/execution/results" element={<ExecutionResultLedgerPage />} />
        <Route path="/execution/outbox" element={<ExecutionOutboxLedgerPage />} />
        <Route path="/execution/writebacks" element={<ExecutionWritebackLedgerPage />} />
        <Route path="/evaluations" element={<AgentEvaluationDashboardPage />} />
        <Route path="/knowledge" element={<KnowledgeInventoryPage />} />
        <Route path="/knowledge/candidates" element={<KnowledgeCandidateReviewPage />} />
        <Route path="/mcp" element={<McpManagementPage />} />
        <Route path="/mcp/invocations" element={<ToolInvocationLedgerPage />} />
        <Route path="/mcp/marketplace" element={<McpMarketplaceManagementPage />} />
        <Route path="/rbac" element={<RbacManagementPage />} />
        <Route path="/ops/readiness" element={<OpsReadinessPage />} />
        <Route path="/ops/monitoring" element={<OpsMonitoringPage />} />
        <Route path="/ops/provider-quota" element={<ProviderQuotaCostPreflightPage />} />
        <Route path="/ops/agent-provider-config" element={<AgentProviderConfigPreflightPage />} />
        <Route path="/ops/agent-provider-transport" element={<AgentProviderTransportDisabledHarnessPage />} />
        <Route path="/ops/provider-http-boundary" element={<ProviderHttpBoundaryPage />} />
        <Route path="/ops/agent-registration-guard" element={<AgentRealAdapterRegistrationGuardPage />} />
        <Route path="/ops/secret-resolver" element={<SecretResolverReadinessPage />} />
        <Route path="/ops/secret-injection" element={<SecretInjectionPreflightPage />} />
        <Route path="/publisher" element={<PublisherWorkbenchPage />} />
        <Route path="/stage-runs/:id" element={<StageRunDetailPage />} />
        <Route path="/agents" element={<AgentListPage />} />
        <Route path="/agents/new" element={<NewAgentPage />} />
        <Route path="/agents/:id" element={<AgentDetailPage />} />
        <Route path="/agent-sessions/:id" element={<AgentSessionDetailPage />} />
        <Route
          path="*"
          element={<EmptyState title="页面不存在" hint="请从左侧导航进入。" />}
        />
      </Routes>
    </AppShell>
  );
}
