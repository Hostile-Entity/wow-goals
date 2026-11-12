import { useAction } from "./useAction";

export interface ConversionContext {
  back(): void;
  undo(): Promise<void>;
}

export function ConversionNotice({ context, beforeAction }: {
  context?: ConversionContext;
  beforeAction?: () => boolean;
}) {
  const action = useAction();
  if (!context) return null;
  const guard = () => !beforeAction || beforeAction();
  return <section className="conversion-notice" aria-label="Conversion result">
    <p>Created from your note. Add details now, or return to your inbox.</p>
    <div className="actions">
      <button disabled={action.pending} onClick={() => { if (guard()) context.back(); }}>Back to Inbox</button>
      <button disabled={action.pending} onClick={() => { if (guard()) void action.run(context.undo); }}>Undo conversion</button>
    </div>
    {action.error && <p role="alert" className="action-error">{action.error}</p>}
  </section>;
}
