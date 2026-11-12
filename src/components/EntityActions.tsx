import { BaseEntity, EntityType } from "../types";
import { AppData } from "../state/useAppData";
import { lifecycle } from "../state/lifecycle";
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
    "setStatus" | "discardEntity" | "recoverEntity" | "permanentDelete"
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
        {entity.status !== "discarded" &&
          lifecycle[type]
            .filter(
              (status) =>
                status !== entity.status &&
                !(type === "task" && status === "done"),
            )
            .map((status) => (
              <button
                key={status}
                disabled={action.pending}
                onClick={() =>
                  run(() => app.setStatus(type, entity.id, status))
                }
              >
                {status === "done"
                  ? "Complete project"
                  : status === "achieved"
                    ? "Achieve goal"
                    : entity.status === "done" || entity.status === "achieved"
                      ? `Reopen as ${status}`
                      : `Mark ${status}`}
              </button>
            ))}
        {entity.status === "discarded" ? (
          <button
            disabled={action.pending}
            onClick={() => run(() => app.recoverEntity(type, entity.id))}
          >
            Recover
          </button>
        ) : (
          <button
            disabled={action.pending}
            onClick={() => run(() => app.discardEntity(type, entity.id))}
          >
            Discard
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
