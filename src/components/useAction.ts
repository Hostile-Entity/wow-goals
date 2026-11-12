import { useRef, useState } from "react";

export function useAction() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const result = await action();
      if (result !== false) after?.();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Your edits were kept; try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { pending, error, run };
}
