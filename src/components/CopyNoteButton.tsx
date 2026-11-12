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
    <button onClick={() => void copy()} type="button">Copy text</button>
    <p className="meta" role="status">{message}</p>
    {fallback && <textarea aria-label="Message to copy" readOnly value={text} rows={5}
      onFocus={event => event.target.select()} />}
  </section>;
}
