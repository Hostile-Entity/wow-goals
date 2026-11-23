import { useEffect, useRef, useState } from "react";
import {
  AppStore,
  Change,
  coreStores,
  logicalDayAt,
  openDb,
  readAppStores,
} from "../db";
import { dataStores, emptyData } from "../db/schema";
import { AppStateData } from "../types";
import { applyChanges } from "./commands";

type View = {
  data: AppStateData;
  loaded: boolean;
  logsReady: boolean;
  reviewReady: boolean;
  completionDay?: string;
};
type Refresh = { stores: AppStore[]; logKeys: string[] };
const allStores: readonly AppStore[] = [...dataStores, "settings"];

/** Keep active data and the optional history in sync without scanning history on Today. */
export function useLiveSnapshot(wantsLogs: boolean, wantsReview: boolean, now: number, setNow: (now: number) => void) {
  const [view, setView] = useState<View>(() => ({
    data: emptyData(), loaded: false, logsReady: false, reviewReady: false,
  }));
  const [error, setError] = useState("");
  const current = useRef(view);
  const stateRef = useRef(view.data);
  const demand = useRef({ wantsLogs, wantsReview, now });
  demand.current = { wantsLogs, wantsReview, now };
  const queue = useRef(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);

  function commit(next: View) {
    current.current = next;
    stateRef.current = next.data;
    setView(next);
  }

  // Preserve snapshot/commit order even when a broadcast, a view change and
  // a local write occur together.
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const job = queue.current.then(operation);
    queue.current = job.then(() => undefined, () => undefined);
    return job;
  }

  function refresh(mode: "all" | "view" | Refresh) {
    return run(async () => {
      const prev = current.current;
      const full = mode === "all" || !prev.loaded;
      const { wantsLogs, wantsReview, now } = demand.current;
      const reviewReady = wantsReview || (!full && prev.reviewReady);
      const logsReady = wantsLogs || reviewReady || (!full && prev.logsReady);
      const stores = new Set<AppStore>(full ? [...coreStores, "completions"] :
        typeof mode === "object" ? mode.stores : []);
      if (logsReady && (full || !prev.logsReady)) stores.add("logs");
      if (reviewReady && (full || !prev.reviewReady)) {
        stores.add("reviews");
        stores.add("completions");
      }
      if (!logsReady) stores.delete("logs");
      if (!reviewReady) {
        stores.delete("reviews");
        if (stores.has("settings") || prev.completionDay !== logicalDayAt(now, prev.data.settings))
          stores.add("completions");
      }
      const logKeys = logsReady && !stores.has("logs") && typeof mode === "object" ? mode.logKeys : [];
      if (!stores.size && !logKeys.length) return;
      try {
        const result = await readAppStores(await openDb(), [...stores], {
          completionAt: reviewReady ? undefined : now,
          logKeys,
        });
        let data = { ...(full ? emptyData() : prev.data), ...result.data };
        if (result.logChanges.length) data = applyChanges(data, result.logChanges);
        commit({
          data, loaded: true, logsReady, reviewReady,
          completionDay: reviewReady ? undefined : result.completionDay ?? prev.completionDay,
        });
        if (full) setError("");
      } catch (error) {
        setError(error instanceof Error
          ? error.message
          : "Could not open local data. Your database has not been reset.");
      }
    });
  }

  function reloadAll() {
    return refresh("all");
  }

  function applyCommitted(changes: Change[]) {
    const prev = current.current;
    const visible = changes.filter((change) =>
      change.store !== "meta" &&
      (change.store !== "logs" || prev.logsReady) &&
      (change.store !== "reviews" || prev.reviewReady) &&
      (change.store !== "completions" || prev.reviewReady ||
        !("row" in change) || ("date" in change.row && change.row.date === prev.completionDay)),
    );
    if (visible.length) commit({ ...prev, data: applyChanges(prev.data, visible) });
    if (!changes.length) return;
    const message: Refresh = { stores: [], logKeys: [] };
    const stores = new Set<AppStore>();
    for (const change of changes) {
      if (change.store === "logs")
        message.logKeys.push("row" in change ? change.row.id : change.deleteId);
      else if (change.store !== "meta") stores.add(change.store);
    }
    message.stores = [...stores];
    channel.current?.postMessage(message);
  }

  function notifyReplacement() {
    // Also understood by older builds that still have a tab open.
    channel.current?.postMessage("changed");
  }

  useEffect(() => {
    let timer: number | undefined;
    let full = false;
    let stores = new Set<AppStore>();
    let logKeys = new Set<string>();
    const flush = () => {
      const mode = full ? "all" : { stores: [...stores], logKeys: [...logKeys] };
      timer = undefined;
      full = false;
      stores = new Set();
      logKeys = new Set();
      void refresh(mode);
    };
    const receive = ({ data }: MessageEvent) => {
      if (Array.isArray(data?.stores) && Array.isArray(data?.logKeys)) {
        for (const key of allStores) if (data.stores.includes(key)) stores.add(key);
        for (const key of data.logKeys) if (typeof key === "string") logKeys.add(key);
      } else {
        full = true;
      }
      timer ??= window.setTimeout(flush, 16);
    };
    const resume = () => {
      if (document.visibilityState === "visible") {
        demand.current.now = Date.now();
        setNow(demand.current.now);
        void reloadAll();
      }
    };
    const blocked = () =>
      setError("Close the other WowGoals tab/window to finish the one-time database upgrade. Do not clear browser data.");
    window.addEventListener("wowgoals-db-blocked", blocked);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resumeFromCache);
    function resumeFromCache(event: PageTransitionEvent) {
      if (event.persisted) resume();
    }
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("wowgoals-v2");
      channel.current.onmessage = receive;
    }
    void reloadAll();
    return () => {
      window.removeEventListener("wowgoals-db-blocked", blocked);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resumeFromCache);
      channel.current?.close();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const logicalDay = logicalDayAt(now, view.data.settings);
  useEffect(() => {
    if (view.loaded) void refresh("view");
  }, [wantsLogs, wantsReview, logicalDay, view.loaded]);

  return { ...view, stateRef, error, setError, run, reloadAll, applyCommitted, notifyReplacement };
}
