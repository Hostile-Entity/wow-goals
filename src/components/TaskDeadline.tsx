import { formatDueLabel } from "../state/useAppData";

export function TaskDeadline({ day, logicalDay }: { day: string; logicalDay: string }) {
  return (
    <time
      dateTime={day}
      className={`task-deadline${day <= logicalDay ? " task-deadline-due" : ""}`}
    >
      {formatDueLabel(day, logicalDay)}
    </time>
  );
}
