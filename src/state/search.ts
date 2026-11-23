import { AppStateData, EntityType } from "../types";

export interface SearchResultItem {
  id: string;
  type: EntityType;
  title: string;
  description: string;
  matchedField: "title" | "description";
}

function getMatchRank(source: string, query: string, index: number): number {
  if (source === query) return 0;
  if (source.startsWith(query)) return 1;
  const prev = source[index - 1];
  if (prev && /[\s_\-.,/]/.test(prev)) return 2;
  return 3;
}

type Collections = Pick<AppStateData, "notes" | "tasks" | "projects" | "goals" | "routines">;
const collections = [
  ["notes", "note"], ["tasks", "task"], ["projects", "project"],
  ["goals", "goal"], ["routines", "routine"],
] as const;

export function buildSearchResults(data: Collections, query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = collections.flatMap(([store, type]) => data[store].flatMap((item) => {
    const title = item.title ?? "";
    const description = item.description ?? "";
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const titleMatch = titleLower.indexOf(q);
    const descMatch = descLower.indexOf(q);
    if (titleMatch < 0 && descMatch < 0) return [];

    const matchedField = titleMatch >= 0 ? "title" as const : "description" as const;
    const matchIndex = matchedField === "title" ? titleMatch : descMatch;
    const source = matchedField === "title" ? titleLower : descLower;
    return [{
      id: item.id, type, title, description, matchedField, matchIndex,
      fieldRank: matchedField === "title" ? 0 : 1,
      matchRank: getMatchRank(source, q, matchIndex),
      updatedAt: item.updatedAt,
    }];
  }));
  return matches
    .sort((a, b) =>
      a.fieldRank - b.fieldRank || a.matchRank - b.matchRank ||
      a.matchIndex - b.matchIndex || b.updatedAt.localeCompare(a.updatedAt),
    )
    .map(({ fieldRank, matchRank, matchIndex, updatedAt, ...result }) => result);
}
