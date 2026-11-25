import { useState } from "react";
import { addDays } from "../db";
import { Task } from "../types";

export function TaskPlanPanel({ task, logicalDay, pending, onPlan, onClose }: {
  task: Task;
  logicalDay: string;
  pending: boolean;
  onPlan(day: string): void;
  onClose(): void;
}) {
  const [until, setUntil] = useState("");
  return (
    <section id={`plan-${task.id}`} className="card today-plan-panel" aria-label={`Replan ${task.title}`}>
      <h4>Plan “{task.title}” for later</h4>
      {task.deadline && <p className="meta">Planning changes the work date, not the deadline.</p>}
      <div className="actions">
        <button disabled={pending} onClick={() => onPlan(addDays(logicalDay, 1))}>Tomorrow</button>
        <button disabled={pending} onClick={() => onPlan(addDays(logicalDay, 7))}>Next week</button>
        <button disabled={pending} onClick={onClose}>Cancel</button>
      </div>
      <form className="row" onSubmit={(event) => {
        event.preventDefault();
        if (until) onPlan(until);
      }}>
        <input
          aria-label="Plan for date"
          type="date"
          min={logicalDay}
          value={until}
          onChange={(event) => setUntil(event.target.value)}
          required
        />
        <button disabled={!until || pending}>Schedule</button>
      </form>
    </section>
  );
}
