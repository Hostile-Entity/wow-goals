import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Dialog({
  title,
  children,
  close,
  dirty = false,
  busy = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  close(): void;
  dirty?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(() => {});
  closeRef.current = () => {
    if (!busy && (!dirty || window.confirm("Discard your unsaved edits?")))
      close();
  };
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
      {children}
    </dialog>,
    document.body,
  );
}
