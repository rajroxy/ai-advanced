import {
  bookOutline,
  coverageHits,
  getBook,
  getBookProfile,
  search,
  terms,
  type SearchHit,
} from "./books.ts";
import { chat, getModelConfig, getPlannerConfig } from "./model.ts";
import { bookFingerprint, extractJson, queryPlannerMessages } from "./prompts.ts";

/**
 * Retrieval: turn a free-form request into indexed keyword lookups, run them
 * against SQLite FTS5, and merge the passages. The model never reads the whole
 * book — the index narrows thousands of pages down to a handful of passages.
 */

export interface RetrieveOptions {
  request: string;
  bookIds: string[];
  limit?: number;
  /** Extra keyword hints (used for per-section retrieval). */
  extraQueries?: string[];
  usePlanner?: boolean;
}

export function buildBookHint(bookIds: string[]): string {
  const books = bookIds.map(getBook).filter((b): b is NonNullable<typeof b> => !!b);
  if (!books.length) return "BOOKS IN SCOPE: (none selected)";
  const outline = bookIds.flatMap((id) => bookOutline(id));
  const summaries = books
    .map((b) => getBookProfile(b.id)?.summary)
    .filter((s): s is string => !!s)
    .join("\n");
  return bookFingerprint(
    books.map((b) => b.title),
    outline.map((o) => ({ chapterTitle: o.chapterTitle, chunks: o.chunks })),
    summaries || undefined,
  );
}

function heuristicQueries(request: string): string[] {
  const all = terms(request);
  if (!all.length) return [request];
  const out: string[] = [all.slice(0, 8).join(" ")];
  // Sliding windows help when a request mixes two topics.
  for (let i = 0; i + 4 <= all.length && out.length < 4; i += 4) {
    out.push(all.slice(i, i + 6).join(" "));
  }
  return [...new Set(out)];
}

export async function planQueries(
  request: string,
  bookHint: string,
  extra: string[] = [],
): Promise<string[]> {
  const planner = getPlannerConfig();
  const base = [...extra, ...heuristicQueries(request)];
  if (!planner.enabled) return [...new Set(base)].slice(0, 6);
  try {
    const reply = await chat(queryPlannerMessages(request, bookHint), {
      model: planner.model || getModelConfig().model,
      temperature: planner.temperature,
      maxTokens: planner.maxTokens,
    });
    const parsed = extractJson<{ queries?: string[] }>(reply);
    const planned = (parsed?.queries ?? []).filter((q) => typeof q === "string" && q.trim());
    const merged = [...new Set([...planned, ...base])];
    return merged.slice(0, 8);
  } catch {
    return [...new Set(base)].slice(0, 6);
  }
}

export function mergeHits(hits: SearchHit[]): SearchHit[] {
  const byChunk = new Map<number, SearchHit>();
  for (const hit of hits) {
    const prev = byChunk.get(hit.chunkId);
    if (!prev || hit.score < prev.score) byChunk.set(hit.chunkId, hit);
  }
  return [...byChunk.values()].sort((a, b) => a.score - b.score);
}

export async function retrieve(opts: RetrieveOptions): Promise<SearchHit[]> {
  const limit = opts.limit ?? getModelConfig().contextChunks;
  const perQuery = Math.max(limit, 6);
  const bookFilter = opts.bookIds.length ? { bookIds: opts.bookIds } : {};
  const hint = buildBookHint(opts.bookIds);

  const usedPlanner = opts.usePlanner !== false;
  const queries = usedPlanner
    ? await planQueries(opts.request, hint, opts.extraQueries)
    : [...new Set([...(opts.extraQueries ?? []), ...heuristicQueries(opts.request)])];

  const collected: SearchHit[] = [];
  for (const q of queries) {
    collected.push(...search(q, { ...bookFilter, limit: perQuery }));
  }
  // Always include the raw request as a literal fallback pass.
  collected.push(...search(opts.request, { ...bookFilter, limit: 4 }));

  const merged = mergeHits(collected).slice(0, limit);
  if (merged.length) return merged;

  // Broad request with no keyword overlap: fall back to a spread of chapter
  // openings so the model still reads the book instead of giving up.
  return coverageHits(opts.bookIds, Math.min(limit, 6));
}
