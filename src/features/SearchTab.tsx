import { RefObject } from "react";
import { EntityType } from "../types";

export interface SearchResultItem {
  id: string;
  type: EntityType;
  title: string;
  description: string;
  matchedField: "title" | "description";
}

interface SearchTabProps {
  query: string;
  results: SearchResultItem[];
  inputRef: RefObject<HTMLInputElement>;
  onQueryChange(next: string): void;
  onBack(): void;
  onSelect(result: SearchResultItem): void;
}

const typeLabel: Record<EntityType, string> = {
  note: "Note",
  task: "Task",
  project: "Project",
  goal: "Goal",
  routine: "Routine",
};

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark>{match}</mark>
      {after}
    </>
  );
}

function buildSnippet(text: string, query: string, radius = 54): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact || !query) return compact;

  const lower = compact.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return compact.length > radius * 2 ? `${compact.slice(0, radius * 2).trimEnd()}...` : compact;

  const start = Math.max(0, idx - radius);
  const end = Math.min(compact.length, idx + q.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compact.length ? "..." : "";
  return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
}

export function SearchTab({ query, results, inputRef, onQueryChange, onBack, onSelect }: SearchTabProps) {
  return (
    <>
      <header className="topbar search-topbar">
        <button className="settings-btn search-back-btn" onClick={onBack} aria-label="Back from search">
          Back
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search notes, tasks, projects, goals, routines"
          aria-label="Search all items"
        />
      </header>

      <main className="main search-main">
        {query.trim().length > 0 ? (
          <div className="cards search-results">
            {results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                className="card search-result-card"
                onClick={() => onSelect(result)}
              >
                <div className="tags search-result-type">{typeLabel[result.type]}</div>
                <div className="title search-result-title">
                  <HighlightedText text={result.title} query={query} />
                </div>
                {result.description ? (
                  <div className="search-result-description">
                    <HighlightedText text={buildSnippet(result.description, query)} query={query} />
                  </div>
                ) : null}
              </button>
            ))}
            {results.length === 0 ? <div className="meta">No matches found.</div> : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
