import { useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  Database,
  FileJson,
  FileText,
  ListTree,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useApp } from "../state";
import { api, type Book, type BookProfile, type OutlineNode } from "../lib/api";
import { SAMPLE_BOOK } from "../lib/sample";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Stat,
  Textarea,
} from "../components/ui";

type ImportTab = "json" | "file" | "sqlite";

export default function Library() {
  const { books, reloadAll, stats } = useApp();
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<ImportTab>("json");
  const [jsonText, setJsonText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [sqlite, setSqlite] = useState({ filePath: "", table: "", textColumn: "", titleColumn: "", pageColumn: "" });

  const [outlineFor, setOutlineFor] = useState<Book | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [profileFor, setProfileFor] = useState<Book | null>(null);
  const [profile, setProfile] = useState<BookProfile | null>(null);
  const [profiling, setProfiling] = useState(false);

  async function doImport(payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const summary = await api.importBook(payload);
      setMessage(`Imported “${summary.title}” — ${summary.chunks.toLocaleString()} passages indexed.`);
      setJsonText("");
      setImportOpen(false);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function importJson() {
    const trimmed = jsonText.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      void doImport(parsed);
    } catch {
      // Not JSON — treat as raw text so plain books still work.
      void doImport({ title: "Pasted book", text: trimmed });
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    const title = file.name.replace(/\.[^.]+$/, "");
    if (file.name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        void doImport({ title, ...parsed });
      } catch {
        setError("That file is not valid JSON.");
      }
    } else {
      void doImport({ title, text: content });
    }
  }

  async function importSqlite() {
    setBusy(true);
    setError(null);
    try {
      const summary = await api.importSqlite({
        filePath: sqlite.filePath,
        table: sqlite.table,
        textColumn: sqlite.textColumn,
        ...(sqlite.titleColumn ? { titleColumn: sqlite.titleColumn } : {}),
        ...(sqlite.pageColumn ? { pageColumn: sqlite.pageColumn } : {}),
      });
      setMessage(`Imported ${summary.chunks.toLocaleString()} passages from SQLite.`);
      setImportOpen(false);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openOutline(book: Book) {
    setOutlineFor(book);
    setOutline([]);
    const { outline } = await api.outline(book.id);
    setOutline(outline);
  }

  async function openProfile(book: Book) {
    setProfileFor(book);
    setProfile(null);
    const { profile } = await api.profile(book.id);
    setProfile(profile);
  }

  async function buildProfile() {
    if (!profileFor) return;
    setProfiling(true);
    try {
      const { profile } = await api.buildProfile(profileFor.id);
      setProfile(profile);
    } finally {
      setProfiling(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Books"
        description="Import a book once and it is indexed locally. The engine searches the index instead of re-reading the book."
        actions={
          <>
            <Button variant="ghost" onClick={() => doImport(SAMPLE_BOOK)}>
              <Sparkles className="h-4 w-4" /> Load sample
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import book
            </Button>
          </>
        }
      />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Books" value={stats.books} />
          <Stat label="Passages indexed" value={stats.chunks.toLocaleString()} />
          <Stat label="Chapters" value={stats.chapters} />
          <Stat label="Generations" value={stats.generations} />
        </div>
      )}

      {message && (
        <div className="mb-5 rounded-xl border border-mint-500/25 bg-mint-500/[0.08] px-4 py-3 text-sm text-mint-400">
          {message}
        </div>
      )}

      {books.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="No books indexed yet"
          description="Import structured JSON, a plain-text export, or rows from a SQLite file. Or load the sample to try the engine immediately."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import book
              </Button>
              <Button variant="ghost" onClick={() => doImport(SAMPLE_BOOK)}>
                Load sample
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {books.map((book) => (
            <Card key={book.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg text-paper-100">{book.title}</h3>
                  <p className="text-xs text-paper-300/50">
                    {book.author ?? "unknown author"}
                    {book.subject ? ` · ${book.subject}` : ""}
                  </p>
                </div>
                <Badge tone={book.source_format === "sqlite" ? "mint" : "neutral"}>
                  {book.source_format === "sqlite" ? <Database className="h-3 w-3" /> : <FileJson className="h-3 w-3" />}
                  {book.source_format}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-ink-900/60 py-2">
                  <div className="font-display text-lg text-paper-100">{book.chunk_count.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wider text-paper-300/40">passages</div>
                </div>
                <div className="rounded-lg bg-ink-900/60 py-2">
                  <div className="font-display text-lg text-paper-100">{book.page_count.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wider text-paper-300/40">pages</div>
                </div>
                <div className="rounded-lg bg-ink-900/60 py-2">
                  <div className="font-display text-lg text-paper-100">{Math.round(book.char_count / 1000)}k</div>
                  <div className="text-[10px] uppercase tracking-wider text-paper-300/40">chars</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openOutline(book)}>
                  <ListTree className="h-3.5 w-3.5" /> Outline
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openProfile(book)}>
                  <BrainCircuit className="h-3.5 w-3.5" /> Understanding
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-300/80"
                  onClick={async () => {
                    await api.deleteBook(book.id);
                    await reloadAll();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* import modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import a book">
        <div className="mb-4 flex gap-1 rounded-xl border border-white/10 p-1">
          {([
            ["json", "Paste JSON", FileJson],
            ["file", "Upload file", FileText],
            ["sqlite", "SQLite file", Database],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                tab === id ? "bg-ember-500/15 text-ember-400" : "text-paper-300/60 hover:text-paper-100"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "json" && (
          <div>
            <Label>Book JSON — chapters → sections → pages</Label>
            <Textarea
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{ "title": "C# Complete", "chapters": [ { "number": 1, "title": "Basics", "sections": [ { "title": "Variables", "pages": [ { "page": 1, "text": "..." } ] } ] } ] }'
              className="font-mono text-xs"
            />
            <p className="mt-2 text-xs text-paper-300/40">
              Plain text also works — we will index it as flat passages. Structured JSON gives
              better chapter/page citations.
            </p>
          </div>
        )}

        {tab === "file" && (
          <div>
            <Label>Choose a .json, .txt or .md file</Label>
            <input
              type="file"
              accept=".json,.txt,.md,.csv"
              onChange={(e) => importFile(e.target.files?.[0])}
              className="w-full rounded-xl border border-dashed border-white/15 bg-ink-900/60 px-4 py-8 text-sm text-paper-300/60 file:mr-3 file:rounded-lg file:border-0 file:bg-ember-500 file:px-3 file:py-1.5 file:text-ink-950"
            />
          </div>
        )}

        {tab === "sqlite" && (
          <div className="grid gap-3">
            <div>
              <Label>Path to .db / .sqlite on this machine</Label>
              <Input
                value={sqlite.filePath}
                onChange={(e) => setSqlite({ ...sqlite, filePath: e.target.value })}
                placeholder="/Users/me/books/csharp.db"
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Table</Label>
                <Input value={sqlite.table} onChange={(e) => setSqlite({ ...sqlite, table: e.target.value })} placeholder="pages" className="font-mono text-xs" />
              </div>
              <div>
                <Label>Text column</Label>
                <Input value={sqlite.textColumn} onChange={(e) => setSqlite({ ...sqlite, textColumn: e.target.value })} placeholder="body" className="font-mono text-xs" />
              </div>
              <div>
                <Label>Title column (optional)</Label>
                <Input value={sqlite.titleColumn} onChange={(e) => setSqlite({ ...sqlite, titleColumn: e.target.value })} placeholder="title" className="font-mono text-xs" />
              </div>
              <div>
                <Label>Page column (optional)</Label>
                <Input value={sqlite.pageColumn} onChange={(e) => setSqlite({ ...sqlite, pageColumn: e.target.value })} placeholder="page_no" className="font-mono text-xs" />
              </div>
            </div>
            <p className="text-xs text-paper-300/40">
              The engine opens the file read-only and streams rows into the local index.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(false)}>
            Cancel
          </Button>
          {tab === "json" && (
            <Button onClick={importJson} disabled={busy || !jsonText.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Index book
            </Button>
          )}
          {tab === "sqlite" && (
            <Button onClick={importSqlite} disabled={busy || !sqlite.filePath || !sqlite.table || !sqlite.textColumn}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Index from SQLite
            </Button>
          )}
        </div>
      </Modal>

      {/* outline modal */}
      <Modal open={!!outlineFor} onClose={() => setOutlineFor(null)} title={outlineFor?.title ?? "Outline"}>
        {outline.length === 0 ? (
          <p className="text-sm text-paper-300/50">Loading…</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {outline.map((node, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-ink-900/50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-paper-100">
                    {node.chapterTitle ?? (node.chapterNo != null ? `Chapter ${node.chapterNo}` : "Flat passages")}
                  </span>
                  <span className="font-mono text-[11px] text-paper-300/40">{node.chunks} passages</span>
                </div>
                {node.sections.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {node.sections.map((s, j) => (
                      <span key={j} className="rounded bg-white/[0.04] px-2 py-0.5 text-[11px] text-paper-300/50">
                        {s.sectionTitle ?? "—"} · {s.chunks}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* profile modal */}
      <Modal open={!!profileFor} onClose={() => setProfileFor(null)} title={`Understanding — ${profileFor?.title ?? ""}`}>
        {!profile ? (
          <div className="py-6 text-center">
            <p className="text-sm text-paper-300/60">
              No understanding stored yet. Generate a profile so the model has a cheap summary of
              the whole book.
            </p>
            <Button className="mt-4" onClick={buildProfile} disabled={profiling}>
              {profiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {profiling ? "Reading…" : "Generate understanding"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Summary</Label>
              <p className="rounded-xl border border-white/[0.06] bg-ink-900/50 px-4 py-3 text-sm text-paper-200/85">
                {profile.summary || "—"}
              </p>
            </div>
            {profile.style && (
              <div>
                <Label>Style & conventions</Label>
                <p className="text-sm text-paper-300/70">{profile.style}</p>
              </div>
            )}
            {profile.concepts.length > 0 && (
              <div>
                <Label>Key concepts</Label>
                <div className="flex flex-wrap gap-1.5">
                  {profile.concepts.map((c) => (
                    <Badge key={c} tone="mint">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Structure</Label>
              <div className="max-h-52 space-y-1.5 overflow-y-auto">
                {profile.structure.map((s, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] bg-ink-900/50 px-3 py-2 text-xs">
                    <span className="text-paper-100">{s.title ?? `Chapter ${s.chapterNo ?? "?"}`}</span>
                    {s.gist && <span className="text-paper-300/50"> — {s.gist}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={buildProfile} disabled={profiling}>
                {profiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
