import { useEffect, useState } from "react";

function workerVersion(worker: ServiceWorker): Promise<string> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      resolve("unknown");
    }, 2500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.version ? `v${event.data.version}` : "unknown");
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}
export function usePwa() {
  const [swVersion, setVersion] = useState(
    import.meta.env.DEV ? "Development" : "unknown",
  );
  const [isCheckingUpdate, setChecking] = useState(false);
  const [isApplyingUpdate, setApplying] = useState(false);
  useEffect(() => {
    if (!navigator.serviceWorker || import.meta.env.DEV) return;
    let cancelled = false;
    const update = async () => {
      const registration = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL,
      );
      const worker = navigator.serviceWorker.controller ?? registration?.active;
      if (worker) {
        const version = await workerVersion(worker);
        if (!cancelled) setVersion(version);
      }
    };
    void update().catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", update);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", update);
    };
  }, []);
  async function checkForUpdates() {
    if (import.meta.env.DEV) {
      window.alert(
        "Updates are available in the installed production app, not the development server.",
      );
      return;
    }
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (!reg)
        throw new Error(
          "The app is not cached yet. Reopen it online and try again.",
        );
      await reg.update();
      const waiting = await new Promise<ServiceWorker | null>((resolve) => {
        if (reg.waiting) {
          resolve(reg.waiting);
          return;
        }
        let timer: number;
        const finish = () => {
          clearTimeout(timer);
          reg.removeEventListener("updatefound", found);
          reg.installing?.removeEventListener("statechange", changed);
          resolve(reg.waiting);
        };
        const changed = () => {
          if (reg.waiting || reg.installing?.state === "redundant") finish();
        };
        const found = () =>
          reg.installing?.addEventListener("statechange", changed);
        reg.addEventListener("updatefound", found);
        found();
        timer = window.setTimeout(finish, 5000);
      });
      const worker = navigator.serviceWorker.controller ?? reg.active;
      if (worker) setVersion(await workerVersion(worker));
      if (!waiting) {
        window.alert(
          "No new update is ready. Your installed version has not changed.",
        );
        return;
      }
      if (
        !window.confirm(
          "An update is ready. Save your open editor first. Reload now? Your captured note draft will be restored.",
        )
      )
        return;
      setApplying(true);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            changed,
          );
          reject(
            new Error(
              "Update did not activate. Your current app is still available.",
            ),
          );
        }, 10000);
        const changed = () => {
          clearTimeout(timeout);
          resolve();
        };
        navigator.serviceWorker.addEventListener("controllerchange", changed, {
          once: true,
        });
        waiting.postMessage({ type: "SKIP_WAITING" });
      });
      window.location.reload();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not check for updates.",
      );
    } finally {
      setChecking(false);
      setApplying(false);
    }
  }
  return { swVersion, isCheckingUpdate, isApplyingUpdate, checkForUpdates };
}
