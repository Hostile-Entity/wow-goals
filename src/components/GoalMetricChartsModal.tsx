import { useMemo } from "react";
import { addDays, toDayString } from "../db";
import { EventLog, Goal, GoalMetric } from "../types";

type MetricPoint = { day: string; value: number };

type MetricUpdateDetail = {
  metricId?: string;
  metricName?: string;
  to?: number;
  occurredDay?: string;
};

interface GoalMetricChartsModalProps {
  goal: Goal;
  logs: EventLog[];
  dayStartHour: number;
  close(): void;
}

function goalMetrics(goal: Goal): GoalMetric[] {
  if (goal.metrics.length > 0) {
    return goal.metrics;
  }
  return [{ id: goal.primaryMetricId, name: "Progress", current: 0, target: 10 }];
}

function sortMetricsPrimaryFirst(goal: Goal): GoalMetric[] {
  const metrics = goalMetrics(goal);
  const primaryId = goal.primaryMetricId;
  return [...metrics].sort((a, b) => {
    if (a.id === primaryId) return -1;
    if (b.id === primaryId) return 1;
    return 0;
  });
}

function parseMetricUpdate(log: EventLog, dayStartHour: number): { metricId: string; metricName: string; day: string; value: number; at: string } | null {
  if (log.action !== "goal-metric-update") return null;
  let detail: MetricUpdateDetail | null = null;
  try {
    detail = JSON.parse(log.detail) as MetricUpdateDetail;
  } catch {
    return null;
  }
  if (!detail?.metricId || typeof detail.to !== "number") return null;
  return {
    metricId: detail.metricId,
    metricName: detail.metricName ?? "Metric",
    day: detail.occurredDay ?? toDayString(log.at, dayStartHour),
    value: detail.to,
    at: log.at,
  };
}

function buildMetricSeries(updates: Array<{ day: string; value: number; at: string }>): MetricPoint[] {
  if (updates.length === 0) return [];
  const byDay = new Map<string, { value: number; at: string }>();
  for (const update of updates.sort((a, b) => a.at.localeCompare(b.at))) {
    const prev = byDay.get(update.day);
    if (!prev || prev.at.localeCompare(update.at) <= 0) {
      byDay.set(update.day, { value: update.value, at: update.at });
    }
  }

  const days = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  let day = firstDay;
  let carry = byDay.get(firstDay)?.value ?? 0;
  const series: MetricPoint[] = [];

  while (day.localeCompare(lastDay) <= 0) {
    const entry = byDay.get(day);
    if (entry) carry = entry.value;
    series.push({ day, value: carry });
    day = addDays(day, 1);
  }

  return series;
}

export function GoalMetricChartsModal({ goal, logs, dayStartHour, close }: GoalMetricChartsModalProps) {
  const orderedMetrics = useMemo(() => sortMetricsPrimaryFirst(goal), [goal]);

  const metricData = useMemo(() => {
    const metricLogMap = new Map<string, Array<{ day: string; value: number; at: string; metricName: string }>>();
    for (const log of logs) {
      if (log.entityType !== "goal" || log.entityId !== goal.id) continue;
      const update = parseMetricUpdate(log, dayStartHour);
      if (!update) continue;
      const rows = metricLogMap.get(update.metricId) ?? [];
      rows.push(update);
      metricLogMap.set(update.metricId, rows);
    }

    return orderedMetrics.map((metric) => {
      const updates = metricLogMap.get(metric.id) ?? [];
      const series = buildMetricSeries(updates);
      const fallbackNames = Array.from(new Set(updates.map((item) => item.metricName).filter((name) => name && name !== metric.name)));
      return {
        metric,
        series,
        fallbackNames,
      };
    });
  }, [goal.id, logs, dayStartHour, orderedMetrics]);

  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="modal metric-charts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <h3>Metric Charts</h3>
          <button onClick={close}>Close</button>
        </div>
        <div className="meta-row">{goal.title}</div>

        <div className="cards">
          {metricData.map(({ metric, series, fallbackNames }) => {
            const values = series.map((point) => point.value);
            const max = values.length > 0 ? Math.max(...values) : 0;
            const yMax = max <= 0 ? 1 : max * 1.1;
            const width = 320;
            const height = 120;
            const pad = 16;
            const points = series.map((point, index) => {
              const x =
                series.length === 1
                  ? width / 2
                  : pad + (index / (series.length - 1)) * (width - pad * 2);
              const y = height - pad - (point.value / yMax) * (height - pad * 2);
              return { x, y, ...point };
            });
            const pathD = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");

            return (
              <article key={metric.id} className="card metric-chart-card">
                <div className="title">{metric.name}</div>
                {fallbackNames.length > 0 && <div className="tags">Also logged as: {fallbackNames.join(", ")}</div>}

                {series.length > 0 ? (
                  <>
                    <svg viewBox={`0 0 ${width} ${height}`} className="metric-chart" role="img" aria-label={`${metric.name} history chart`}>
                      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="metric-chart-axis" />
                      <path d={pathD} className="metric-chart-line" />
                      <text x={pad} y={height - pad - 4} className="metric-chart-axis-label">
                        0
                      </text>
                      {points.map((point) => (
                        <g key={`${metric.id}-${point.day}`}>
                          <text x={point.x} y={Math.max(10, point.y - 8)} textAnchor="middle" className="metric-chart-point-label">
                            {point.value}
                          </text>
                          <circle cx={point.x} cy={point.y} r="2.6" className="metric-chart-dot" />
                        </g>
                      ))}
                    </svg>
                    <div className="meta-row metric-chart-meta">
                      {series[0].day} to {series[series.length - 1].day} ({series.length} days)
                    </div>
                  </>
                ) : (
                  <div className="meta-row">No metric updates yet.</div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
