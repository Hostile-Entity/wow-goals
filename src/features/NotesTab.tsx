import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppData, getStatusBucket } from "../state/useAppData";
import { Note } from "../types";
import { ItemTimestamp } from "../components/ItemTimestamp";
import { ExpandableDescription } from "../components/ExpandableDescription";
import { NoteMarkdown } from "../components/NoteMarkdown";

interface NotesTabProps {
  filteredNotes: AppData["filteredNotes"];
  showStatus: boolean;
  statusLabel: AppData["statusLabel"];
  onManage(note: Note): void;
  ensureVisibleItemId?: string | null;
}

const NOTES_PAGE_SIZE = 60;

interface NoteCardProps {
  note: Note;
  showStatus: boolean;
  statusLabel: AppData["statusLabel"];
  onManage(note: Note): void;
}

const NoteCard = memo(function NoteCard({
  note,
  showStatus,
  statusLabel,
  onManage,
}: NoteCardProps) {
  const bucket = getStatusBucket(note);
  const cardToneClass =
    bucket === "in_progress"
      ? "is-in-progress"
      : bucket !== "active"
        ? "is-dimmed"
        : "";

  return (
    <article
      key={note.id}
      id={`item-note-${note.id}`}
      className={`card note-card ${cardToneClass}`}
    >
      <div className="card-top-row">
        <div className="note-main">
          <div className="title note-title">{note.title}</div>
          {note.description ? (
            <ExpandableDescription className="note-description">
              <NoteMarkdown text={note.description} />
            </ExpandableDescription>
          ) : null}
        </div>
        <div className="note-side">
          <button
            className="manage-btn"
            onClick={() => onManage(note)}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="card-footer">
        <div className="card-footer-left">
          {showStatus || note.triagedTo ? (
            <div className="tags note-status">
              {showStatus ? statusLabel(note) : ""}
              {note.triagedTo
                ? `${showStatus ? " → " : "Converted to "}${note.triagedTo}`
                : ""}
            </div>
          ) : null}
        </div>
        <ItemTimestamp entity={note} />
      </div>
    </article>
  );
});

export function NotesTab({
  filteredNotes,
  showStatus,
  statusLabel,
  onManage,
  ensureVisibleItemId,
}: NotesTabProps) {
  const [visibleCount, setVisibleCount] = useState(NOTES_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(NOTES_PAGE_SIZE);
  }, [filteredNotes]);

  useEffect(() => {
    if (!ensureVisibleItemId?.startsWith("item-note-")) return;
    const noteId = ensureVisibleItemId.replace("item-note-", "");
    const targetIndex = filteredNotes.findIndex((note) => note.id === noteId);
    if (targetIndex < 0 || targetIndex < visibleCount) return;
    const requiredCount =
      Math.ceil((targetIndex + 1) / NOTES_PAGE_SIZE) * NOTES_PAGE_SIZE;
    setVisibleCount(Math.min(filteredNotes.length, requiredCount));
  }, [ensureVisibleItemId, filteredNotes, visibleCount]);

  const visibleNotes = useMemo(
    () => filteredNotes.slice(0, visibleCount),
    [filteredNotes, visibleCount],
  );
  const hasMore = visibleCount < filteredNotes.length;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((prev) =>
      Math.min(prev + NOTES_PAGE_SIZE, filteredNotes.length),
    );
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
    if (!ensureVisibleItemId?.startsWith("item-note-")) return;
    const index = visibleNotes.findIndex(
      (note) => `item-note-${note.id}` === ensureVisibleItemId,
    );
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "center" });
  }, [ensureVisibleItemId, visibleNotes, rowVirtualizer]);

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
      <div
        style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
      >
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
              <NoteCard
                note={note}
                showStatus={showStatus}
                statusLabel={statusLabel}
                onManage={onManage}
              />
            </div>
          );
        })}
      </div>
      <div className="meta notes-virtual-meta">
        {hasMore
          ? `Loaded ${visibleNotes.length}/${filteredNotes.length}. Scroll for more...`
          : `Loaded ${filteredNotes.length} notes.`}
      </div>
    </div>
  );
}
