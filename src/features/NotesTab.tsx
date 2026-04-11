import { AppData, getStatusBucket } from "../state/useAppData";
import { Note } from "../types";

interface NotesTabProps {
  filteredNotes: AppData["filteredNotes"];
  statusLabel: AppData["statusLabel"];
  onManage(note: Note): void;
  formatDateTime(iso: string): string;
}

export function NotesTab({ filteredNotes, statusLabel, onManage, formatDateTime }: NotesTabProps) {
  return (
    <div className="cards">
      {filteredNotes.map((note) => {
        const bucket = getStatusBucket(note);
        const cardToneClass = bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : "";

        return (
          <article key={note.id} id={`item-note-${note.id}`} className={`card note-card ${cardToneClass}`}>
            <div className="note-main">
              <div className="title note-title">{note.title}</div>
              {note.description ? <div className="note-description">{note.description}</div> : null}
              <div className="tags note-status">
                {statusLabel(note)}
                {note.triagedTo ? ` -> ${note.triagedTo}` : ""}
              </div>
            </div>
            <div className="note-side">
              <button onClick={() => onManage(note)}>Manage</button>
              <div className="meta-row note-meta-time">
                {note.createdAt === note.updatedAt
                  ? `Created ${formatDateTime(note.createdAt)}`
                  : `Updated ${formatDateTime(note.updatedAt)}`}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
