import { useNavigate } from "react-router-dom";
import { ErrorBar } from "../../components/states.js";
import { useCreateWorkflow } from "./hooks.js";
import { WorkflowForm, toCreateWorkflowBody } from "./WorkflowForm.js";

export function NewWorkflowPage() {
  const navigate = useNavigate();
  const create = useCreateWorkflow();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>新建工作流</h1>
          <p>创建后为 draft，激活后方可启动运行。</p>
        </div>
      </div>
      {create.isError && (
        <ErrorBar message={`创建失败：${(create.error as Error).message}`} />
      )}
      <WorkflowForm
        submitLabel="创建工作流"
        pending={create.isPending}
        onSubmit={(v) =>
          create.mutate(toCreateWorkflowBody(v), {
            onSuccess: (w) => navigate(`/workflows/${w.id}`),
          })
        }
      />
    </div>
  );
}
