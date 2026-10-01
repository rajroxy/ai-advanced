import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, FileSearch, Search as SearchIcon, Timer } from "lucide-react";
import { useApp } from "../state";
import { api, type SearchHit } from "../lib/api";
import { Badge, Card, EmptyState, Input, PageHeader, Snippet, Spinner } from "../components/ui";

export default function Search() {
  const { books } = useApp();
  const [query, setQuery] = useState("");
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const run = useCallback(
    async (q: string, ids: string[]) => {
      if (!q.trim()) {
        setHits([]);
        return;
      }
      setLoading(true);
      const started = performance.now();
      try {
        const { hits } = await api.search(q, ids, 30);
        setHits(hits);
        setElapsed(performance.now() - started);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(query, bookIds), 180);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query, bookIds, run]);

  const toggleBook = (id: string) =>
    setBookIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.bookTitle) ?? [];
      list.push(hit);
      map.set(hit.bookTitle, list);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div>
      <PageHeader
        eyebrow="Find"
        title="Instant search"
        description="A BM25 index over every passage. Typing searches an inverted index — it never re-reads the book from the start."
        actions={
          elapsed != null && query ? (
            <Badge tone="mint">
              <Timer className="h-3 w-3" /> {elapsed.toFixed(1)} ms
            </Badge>
          ) : undefined
        }
      />

      <Card className="p-5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300/40" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the book — a term, a phrase, an identifier…"
            className="pl-10"
          />
        </div>

        {books.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {books.map((book) => {
              const active = bookIds.includes(book.id);
              return (
                <button
                  key={book.id}
                  onClick={() => toggleBook(book.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                    active
                      ? "border-ember-500/40 bg-ember-500/12 text-ember-400"
                      : "border-white/10 text-paper-300/50 hover:border-white/20"
                  }`}
                >
                  {book.title}
                </button>
              );
            })}
            {bookIds.length > 0 && (
              <button
                onClick={() => setBookIds([])}
                className="rounded-lg px-2.5 py-1 text-[11px] text-paper-300/40 hover:text-paper-100"
              >
                clear
              </button>
            )}
          </div>
        )}
      </Card>

      <div className="mt-6">
        {loading && hits.length === 0 ? (
          <div className="py-10 text-center">
            <Spinner label="Searching the index" />
          </div>
        ) : query && hits.length === 0 ? (
          <EmptyState
            icon={<FileSearch className="h-7 w-7" />}
            title="No passages matched"
            description="Try fewer, more distinctive words — the index matches tokens and prefixes."
          />
        ) : hits.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-7 w-7" />}
            title="Start typing to find anything"
            description={
              books.length
                ? "Search across every imported book at once."
                : "Import a book first, then search it here."
            }
            action={
              !books.length ? (
                <Link to="/app/library" className="text-sm text-ember-400 hover:underline">
                  Go to the library →
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-6">
            <p className="text-xs text-paper-300/40">
              {hits.length} passages{bookIds.length ? " in selected books" : ""}
            </p>
            {grouped.map(([bookTitle, list]) => (
              <div key={bookTitle}>
                <h3 className="mb-2 font-display text-lg text-paper-100">{bookTitle}</h3>
                <div className="space-y-2">
                  {list.map((hit) => (
                    <button
                      key={hit.chunkId}
                      onClick={() => setExpanded(expanded === hit.chunkId ? null : hit.chunkId)}
                      className="block w-full rounded-xl border border-white/[0.06] bg-ink-850/60 px-4 py-3 text-left transition hover:border-ember-500/20"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-paper-300/45">
                        <span className="text-paper-200/80">
                          {hit.chapterTitle ?? (hit.chapterNo != null ? `Chapter ${hit.chapterNo}` : "Passage")}
                        </span>
                        {hit.sectionTitle && <span>· {hit.sectionTitle}</span>}
                        {hit.page != null && <span>· p.{hit.page}</span>}
                      </div>
                      <Snippet
                        text={hit.snippet}
                        className={`mt-1.5 block text-sm leading-relaxed text-paper-200/85 ${
                          expanded === hit.chunkId ? "" : "line-clamp-2"
                        }`}
                      />
                      {expanded === hit.chunkId && (
                        <p className="mt-3 whitespace-pre-wrap border-t border-white/[0.06] pt-3 text-[13px] leading-relaxed text-paper-300/70">
                          {hit.text}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
