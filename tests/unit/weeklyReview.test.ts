import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { mutateDatabase, openDatabase, readSnapshot } from "../../src/db";
import { reviewFields, WeeklyReviewConflict, weeklyReviewCommand } from "../../src/state/weeklyReview";
import { WeeklyReview } from "../../src/types";

it.each([false, true])("serializes concurrent same-week saves (existing=%s)", async (existing) => {
  const name = `weekly-review-${crypto.randomUUID()}`;
  const first = await openDatabase(name);
  const second = await openDatabase(name);
  const weekKey = "2026-W47";
  const fields = reviewFields(undefined);
  const save = (db: IDBDatabase, note: string, baseline?: WeeklyReview) =>
    mutateDatabase(db, { read: [{ store: "reviews", index: "by-week", key: weekKey }], write: ["reviews", "logs"] }, (records) =>
      weeklyReviewCommand(records, weekKey, { ...fields, note }, baseline),
    );
  try {
    if (existing) await save(first, "First draft");
    const [baseline] = (await readSnapshot(first)).reviews;
    // Even if the winner saved unchanged fields, it advanced the revision.
    const winningNote = baseline?.note ?? "First draft";
    const writes = await Promise.allSettled([
      save(first, winningNote, baseline),
      save(second, "Second draft", baseline),
    ]);
    expect(writes[0].status).toBe("fulfilled");
    expect(writes[1]).toEqual({ status: "rejected", reason: expect.any(WeeklyReviewConflict) });

    const { reviews, logs } = await readSnapshot(first);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ weekKey, note: winningNote });
    if (baseline) {
      expect(reviews[0]).toMatchObject({ id: baseline.id, createdAt: baseline.createdAt });
      expect(reviews[0].revision).not.toBe(baseline.revision);
    }
    expect(logs.filter((log) => log.action === "review")).toHaveLength(existing ? 2 : 1);
  } finally {
    first.close();
    second.close();
  }
});
