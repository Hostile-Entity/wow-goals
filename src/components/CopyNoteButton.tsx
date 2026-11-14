import { useState } from "react";

/** Copy the current draft, not stale saved text. Manual fallback stays in this dialog. */
export function CopyNoteButton({ title, description }: { title: string; description: string }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState(false);
  const text = title + (description ? `\n${description}` : "");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFallback(false);
      setMessage("Note copied.");
    } catch {
      setFallback(true);
      setMessage("Clipboard unavailable. Select and copy the text below.");
    }
  }
  return <section className="copy-note">
    <button className="copy-note-button" aria-label="Copy text" title="Copy text" onClick={() => void copy()} type="button">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
      </svg>
    </button>
    <p className="meta" role="status">{message}</p>
    {fallback && <textarea aria-label="Message to copy" readOnly value={text} rows={5}
      onFocus={event => event.target.select()} />}
  </section>;
}
