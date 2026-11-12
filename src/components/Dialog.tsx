import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Dialog({
  title,
  children,
  close,
  dirty = false,
  busy = false,
  className = "",
  footer,
}: {
  title: string;
  children: ReactNode;
  close(): void;
  dirty?: boolean;
  busy?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(() => {});
  closeRef.current = () => {
    if (!busy && (!dirty || window.confirm("Discard your unsaved edits?")))
      close();
  };
  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const dialog = ref.current;
      if (!dialog) return;
      dialog.style.setProperty("--dialog-height", `${viewport?.height ?? window.innerHeight}px`);
      dialog.style.setProperty("--dialog-top", `${viewport?.offsetTop ?? 0}px`);
      if (dialog.classList.contains("entity-editor") && dialog.contains(document.activeElement)) {
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: "nearest" }));
      }
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  return createPortal(
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      aria-busy={busy}
      data-dirty={dirty}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.defaultPrevented ||
            (event.target as HTMLElement).closest("dialog") !== event.currentTarget) return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, a[href], summary, [tabindex], [contenteditable=true]",
        )).filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }}
      onClick={(event) => {
        if (event.target !== ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          closeRef.current();
      }}
    >
      <div className="card-top">
        <h3 id={titleId}>{title}</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => closeRef.current()}
        >
          Close
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </dialog>,
    document.body,
  );
}
