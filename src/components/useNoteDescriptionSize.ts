import { RefObject, useEffect } from "react";

/** Reserve spare space once, then let the normal editor document flow scroll. */
export function useNoteDescriptionSize(
  ref: RefObject<HTMLTextAreaElement>,
  enabled: boolean,
) {
  useEffect(() => {
    const textarea = ref.current;
    const body = textarea?.closest<HTMLElement>(".modal-body");
    if (!enabled || !textarea || !body) return;

    let previousBodyHeight = -1;
    let automaticHeight: number | undefined;
    const fit = () => {
      if (body.clientHeight === previousBodyHeight) return;
      previousBodyHeight = body.clientHeight;
      const currentHeight = textarea.getBoundingClientRect().height;
      // A manual resize belongs to the user, including on viewport changes.
      if (automaticHeight !== undefined && Math.abs(currentHeight - automaticHeight) > 1) return;
      const last = body.lastElementChild;
      if (!last) return;
      const available = body.getBoundingClientRect().top + body.clientHeight
        - Number.parseFloat(getComputedStyle(body).paddingBottom)
        - last.getBoundingClientRect().bottom - body.scrollTop;
      automaticHeight = Math.max(96, currentHeight + available);
      textarea.style.height = `${automaticHeight}px`;
    };
    // Dialog.showModal runs in an effect; measure only once it is open.
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [enabled, ref]);
}
