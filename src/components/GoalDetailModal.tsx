import { useState } from "react";
import { AppData } from "../state/useAppData";
import { EntityType, Goal } from "../types";
import { isOpen } from "../state/lifecycle";
import { Dialog } from "./Dialog";
import { EntityActions } from "./EntityActions";
import { GoalMetricChartsModal } from "./GoalMetricChartsModal";
import { useAction } from "./useAction";

export function GoalDetailModal({
  goal,
  app,
  edit,
  open,
  close,
}: {
  goal: Goal;
  app: AppData;
  edit(): void;
  open(type: EntityType, id: string): void;
  close(): void;
}) {
  const [charts, setCharts] = useState(false);
  const [value, setValue] = useState(String(app.primaryMetric(goal).current));
  const action = useAction();
  const primary = app.primaryMetric(goal);
  const dirty = !value.trim() || Number(value) !== primary.current;
  const guard = () =>
    !dirty || window.confirm("Discard the unsaved metric value?");
  const linked = [
    ...app.state.projects.map((row) => ({ ...row, type: "project" as const })),
    ...app.state.tasks.map((row) => ({ ...row, type: "task" as const })),
    ...app.state.routines.map((row) => ({ ...row, type: "routine" as const })),
  ].filter((row) => row.goalId === goal.id);
  return (
    <Dialog
      title={goal.title}
      close={close}
      dirty={dirty}
      busy={action.pending || app.busy}
    >
      <p className="entity-description">{goal.description}</p>
      <div className="actions">
        <button
          onClick={() => {
            if (guard()) edit();
          }}
        >
          Edit goal
        </button>
        <button onClick={() => setCharts(true)}>Chart history</button>
      </div>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(() =>
            app.updateEntity("goal", goal.id, (row: Goal) => ({
              ...row,
              metrics: row.metrics.map((metric) =>
                metric.id === primary.id
                  ? { ...metric, current: Number(value) }
                  : metric,
              ),
            })),
          );
        }}
      >
        <label>
          {primary.name}
          <input
            aria-label="Primary metric value"
            type="number"
            step="any"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </label>
        <button disabled={action.pending}>Update value</button>
      </form>
      {action.error && (
        <p role="alert" className="action-error">
          {action.error}
        </p>
      )}
      <details>
        <summary>All metrics ({goal.metrics.length})</summary>
        {goal.metrics.map((metric) => (
          <p key={metric.id}>
            {metric.name}: {metric.current}/{metric.target}
          </p>
        ))}
      </details>
      <h4>Open linked work ({linked.filter(isOpen).length})</h4>
      <div className="cards">
        {linked.filter(isOpen).map((row) => (
          <button
            key={row.id}
            onClick={() => {
              if (guard()) open(row.type, row.id);
            }}
          >
            {row.type}: {row.title}
          </button>
        ))}
      </div>
      <details>
        <summary>
          Other linked work ({linked.filter((row) => !isOpen(row)).length})
        </summary>
        {linked
          .filter((row) => !isOpen(row))
          .map((row) => (
            <button
              key={row.id}
              onClick={() => {
                if (guard()) open(row.type, row.id);
              }}
            >
              {row.title} · {row.status}
            </button>
          ))}
      </details>
      <EntityActions type="goal" entity={goal} app={app} beforeAction={guard} />
      {charts && (
        <GoalMetricChartsModal
          goal={goal}
          logs={app.state.logs}
          dayStartHour={app.dayStartHour}
          close={() => setCharts(false)}
        />
      )}
    </Dialog>
  );
}
