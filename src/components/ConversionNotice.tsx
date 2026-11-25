import { useAction } from "./useAction";

export interface ConversionContext {
  back(): void;
  undo(): Promise<void>;
  open?(): void;
  backLabel?: string;
}

export function ConversionNotice({ context, beforeAction }: {
  context?: ConversionContext;
  beforeAction?: () => boolean;
}) {
  const action = useAction();
  if (!context) return null;
  const guard = () => !beforeAction || beforeAction();
  return <section className="conversion-notice" aria-label="Conversion result">
    <p>{context.open ? "Previous note converted." : "Created from your note."}</p>
    <div className="actions">
      {context.open && (
        <button disabled={action.pending} onClick={() => { if (guard()) context.open?.(); }}>Open result</button>
      )}
      <button disabled={action.pending} onClick={() => { if (context.open || guard()) context.back(); }}>
        {context.open ? "Dismiss" : context.backLabel ?? "Back to Inbox"}
      </button>
      <button disabled={action.pending} onClick={() => { if (context.open || guard()) void action.run(context.undo); }}>Undo conversion</button>
    </div>
    {action.error && <p role="alert" className="action-error">{action.error}</p>}
  </section>;
}
