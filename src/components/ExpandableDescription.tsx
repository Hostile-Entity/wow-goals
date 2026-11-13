import { ReactNode, useId, useLayoutEffect, useRef, useState } from "react";

const PREVIEW_LINES = 10;

/** Measure rendered height, so wrapping and Markdown count, but titles do not. */
export function ExpandableDescription({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight);
      const tooLong = content.scrollHeight > lineHeight * PREVIEW_LINES + 1;
      setOverflows(tooLong);
      if (!tooLong) setExpanded(false);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className={`${className} expandable-description`}>
      <div
        id={id}
        className={`description-viewport${expanded ? " is-expanded" : ""}`}
        // Hidden links must not receive keyboard focus while collapsed.
        onFocusCapture={() => setExpanded(true)}
      >
        <div ref={contentRef} className="description-content">{children}</div>
      </div>
      {overflows && (
        <button
          type="button"
          className="description-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
          {" "}<span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
        </button>
      )}
    </div>
  );
}
