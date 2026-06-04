import { useNavigate } from "react-router-dom";
import { ErrorBar } from "../../components/states.js";
import { useCreateTask } from "./hooks.js";
import { TaskForm, toIsoOrNull, toRequirementData } from "./TaskForm.js";

export function NewTaskPage() {
  const navigate = useNavigate();
  const create = useCreateTask();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>新建任务</h1>
          <p>创建后默认进入 draft，可在详情页确认需求。</p>
        </div>
      </div>
      {create.isError && (
        <ErrorBar message={`创建失败：${(create.error as Error).message}`} />
      )}
      <TaskForm
        submitLabel="创建任务"
        pending={create.isPending}
        onSubmit={(v) =>
          create.mutate(
            {
              title: v.title.trim(),
              content_type: v.content_type,
              priority: v.priority,
              requirement_data: toRequirementData(v),
              due_at: toIsoOrNull(v.due_at),
            },
            { onSuccess: (t) => navigate(`/content/tasks/${t.id}`) },
          )
        }
      />
    </div>
  );
}
