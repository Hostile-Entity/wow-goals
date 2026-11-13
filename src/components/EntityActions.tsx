import { BaseEntity, EntityType } from "../types";
import { AppData } from "../state/useAppData";
import { lifecycle, statusActionLabel } from "../state/lifecycle";
import { useAction } from "./useAction";

export function EntityActions({
  type,
  entity,
  app,
  beforeAction,
}: {
  type: EntityType;
  entity: BaseEntity;
  app: Pick<
    AppData,
    "setStatus" | "permanentDelete" | "completeRoutine" | "isRoutineCompletedToday"
  >;
  beforeAction?: () => boolean;
}) {
  const action = useAction();
  const run = (operation: () => Promise<unknown>) => {
    if (!beforeAction || beforeAction()) void action.run(operation);
  };
  return (
    <>
      <div
        className="actions lifecycle-actions"
        aria-label={`${type} lifecycle`}
      >
        {lifecycle[type]
          .filter(
            (status) =>
              status !== entity.status &&
              !(type === "task" && status === "done") &&
              !(entity.status === "archived" && ["done", "achieved"].includes(status)),
          )
          .map((status) => (
            <button
              key={status}
              disabled={action.pending}
              onClick={() =>
                run(() => app.setStatus(type, entity.id, status))
              }
            >
              {statusActionLabel(type, entity.status, status)}
            </button>
          ))}
        {type === "routine" && entity.status === "enabled" && (
          <button
            disabled={action.pending}
            onClick={() => run(() => app.completeRoutine(entity.id))}
          >
            {app.isRoutineCompletedToday(entity.id) ? "Undo today's completion" : "Done today"}
          </button>
        )}
        <button
          className="danger"
          disabled={action.pending}
          onClick={() => run(() => app.permanentDelete(type, entity.id))}
        >
          Delete
        </button>
      </div>
      {action.error && (
        <p className="action-error" role="alert">
          {action.error}
        </p>
      )}
    </>
  );
}
