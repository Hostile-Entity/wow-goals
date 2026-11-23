import { Change, Records, uid } from "../db";
import { WeeklyReview } from "../types";
import { event, nowIso } from "./commands";

export type ReviewFields = Omit<WeeklyReview, "id" | "weekKey" | "createdAt" | "revision">;
export type SaveWeeklyReview = (
  weekKey: string,
  fields: ReviewFields,
  baseline: WeeklyReview | undefined,
) => Promise<void>;

export function reviewFields(review: WeeklyReview | undefined): ReviewFields {
  return {
    goalsChecked: Boolean(review?.goalsChecked),
    inboxCleared: Boolean(review?.inboxCleared),
    tasksPrioritized: Boolean(review?.tasksPrioritized),
    weekPlanned: Boolean(review?.weekPlanned),
    note: review?.note ?? "",
  };
}

export class WeeklyReviewConflict extends Error {
  constructor() {
    super("This week's saved review changed in another tab. Your draft was kept. Copy your changes before discarding the draft.");
  }
}

function matchesBaseline(current: WeeklyReview | undefined, baseline: WeeklyReview | undefined) {
  if (!current || !baseline) return current === baseline;
  // Compare the fields as well as the revision so legacy records and writes
  // made by a build that does not issue review revisions are detected.
  return current.id === baseline.id &&
    current.createdAt === baseline.createdAt &&
    current.revision === baseline.revision &&
    current.goalsChecked === baseline.goalsChecked &&
    current.inboxCleared === baseline.inboxCleared &&
    current.tasksPrioritized === baseline.tasksPrioritized &&
    current.weekPlanned === baseline.weekPlanned &&
    current.note === baseline.note;
}

export function weeklyReviewCommand(
  records: Records<"reviews">,
  weekKey: string,
  fields: ReviewFields,
  baseline: WeeklyReview | undefined,
): Change<"reviews" | "logs">[] {
  const previous = records.reviews.find((row) => row.weekKey === weekKey);
  if (!matchesBaseline(previous, baseline)) throw new WeeklyReviewConflict();
  const review: WeeklyReview = {
    ...fields,
    weekKey,
    id: previous?.id ?? uid("review"),
    revision: uid("revision"),
    createdAt: previous?.createdAt ?? nowIso(),
  };
  return [
    { store: "reviews", row: review },
    event("review", "weekly", review.id, weekKey),
  ];
}
