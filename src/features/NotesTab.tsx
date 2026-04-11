import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppData, getStatusBucket } from "../state/useAppData";
import { Note } from "../types";

interface NotesTabProps {
  filteredNotes: AppData["filteredNotes"];
  statusLabel: AppData["statusLabel"];
  onManage(note: Note): void;
  formatDateTime(iso: string): string;
  ensureVisibleItemId?: string | null;
}

const NOTES_PAGE_SIZE = 60;

interface NoteCardProps {
  note: Note;
  statusLabel: AppData["statusLabel"];
  onManage(note: Note): void;
  formatDateTime(iso: string): string;
}

const NoteCard = memo(function NoteCard({ note, statusLabel, onManage, formatDateTime }: NoteCardProps) {
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
});

export function NotesTab({ filteredNotes, statusLabel, onManage, formatDateTime, ensureVisibleItemId }: NotesTabProps) {
  const [visibleCount, setVisibleCount] = useState(NOTES_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(NOTES_PAGE_SIZE);
  }, [filteredNotes]);

  useEffect(() => {
    if (!ensureVisibleItemId?.startsWith("item-note-")) return;
    const noteId = ensureVisibleItemId.replace("item-note-", "");
    const targetIndex = filteredNotes.findIndex((note) => note.id === noteId);
    if (targetIndex < 0 || targetIndex < visibleCount) return;
    const requiredCount = Math.ceil((targetIndex + 1) / NOTES_PAGE_SIZE) * NOTES_PAGE_SIZE;
    setVisibleCount(Math.min(filteredNotes.length, requiredCount));
  }, [ensureVisibleItemId, filteredNotes, visibleCount]);

  const visibleNotes = useMemo(() => filteredNotes.slice(0, visibleCount), [filteredNotes, visibleCount]);
  const hasMore = visibleCount < filteredNotes.length;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((prev) => Math.min(prev + NOTES_PAGE_SIZE, filteredNotes.length));
  }, [hasMore, filteredNotes.length]);

  const rowVirtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => document.querySelector(".main"),
    getItemKey: (index) => visibleNotes[index]?.id ?? index,
    estimateSize: () => 124,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!hasMore || virtualItems.length === 0) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= visibleNotes.length - 4) {
      loadMore();
    }
  }, [hasMore, visibleNotes.length, loadMore, virtualItems]);

  if (visibleNotes.length === 0) {
    return <div className="meta">No notes in this filter.</div>;
  }

  return (
    <div className="cards notes-virtual-wrap">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((virtualRow) => {
          const note = visibleNotes[virtualRow.index];
          if (!note) return null;
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="notes-virtual-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <NoteCard note={note} statusLabel={statusLabel} onManage={onManage} formatDateTime={formatDateTime} />
            </div>
          );
        })}
      </div>
      <div className="meta notes-virtual-meta">
        {hasMore ? `Loaded ${visibleNotes.length}/${filteredNotes.length}. Scroll for more...` : `Loaded ${filteredNotes.length} notes.`}
      </div>
    </div>
  );
}
