import { useState } from "react";
import { WeeklyReview } from "../types";
import {
  ReviewFields,
  SaveWeeklyReview,
  WeeklyReviewConflict,
  reviewFields,
} from "./weeklyReview";

type Draft = {
  // Clean edit mode has no changes; it displays the latest persisted fields.
  changes?: { fields: ReviewFields; baseline: WeeklyReview | undefined };
  saving?: boolean;
  error?: string;
  conflict?: boolean;
};

export function useWeeklyReviewDrafts(saveWeeklyReview: SaveWeeklyReview) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  function setDraft(weekKey: string, draft: Draft) {
    setDrafts((current) => ({ ...current, [weekKey]: draft }));
  }

  function discard(weekKey: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[weekKey];
      return next;
    });
  }

  function update(weekKey: string, review: WeeklyReview | undefined, patch: Partial<ReviewFields>) {
    setDrafts((current) => {
      const draft = current[weekKey];
      const changes = draft?.changes ?? { fields: reviewFields(review), baseline: review };
      return {
        ...current,
        [weekKey]: { ...draft, changes: { ...changes, fields: { ...changes.fields, ...patch } } },
      };
    });
  }

  async function save(weekKey: string, review: WeeklyReview | undefined) {
    const draft = drafts[weekKey];
    if (draft?.saving || draft?.conflict) return;
    const changes = draft?.changes ?? { fields: reviewFields(review), baseline: review };
    setDraft(weekKey, { changes, saving: true });
    try {
      await saveWeeklyReview(weekKey, changes.fields, changes.baseline);
      discard(weekKey);
    } catch (error) {
      setDraft(weekKey, {
        changes,
        conflict: error instanceof WeeklyReviewConflict,
        error: error instanceof Error ? error.message : "Review was not saved. Your reflection was kept.",
      });
    }
  }

  return { drafts, begin: (weekKey: string) => setDraft(weekKey, {}), update, save, discard };
}

export type WeeklyReviewDrafts = ReturnType<typeof useWeeklyReviewDrafts>;
