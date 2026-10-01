import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  Check,
  Copy,
  Download,
  History,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useApp } from "../state";
import {
  api,
  streamGenerate,
  type Generation,
  type SourceRef,
} from "../lib/api";
import { Markdown } from "../lib/markdown";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Snippet,
  Spinner,
  Textarea,
} from "../components/ui";

type Mode = "auto" | "single" | "sectioned";

const EXAMPLES = [
  "Write a complete console program that reads a CSV file and groups rows by a column.",
  "Write a short story that uses the book's core concepts as its world.",
  "Design a small system that applies the book's main techniques end to end.",
  "Generate a working example that combines the book's last two chapters.",
];

export default function Generate() {
  const { books, projects, model, reloadAll } = useApp();

  const [request, setRequest] = useState("");
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [maxSections, setMaxSections] = useState(6);
  const [newProject, setNewProject] = useState("");

  const [output, setOutput] = useState("");
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [plan, setPlan] = useState<{ title?: string; sections: { title: string; brief: string }[] } | null>(null);
  const [status, setStatus] = useState("");
  const [section, setSection] = useState<{ index: number; total: number; title: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [grounding, setGrounding] = useState<{
    paragraphs: number;
    cited: number;
    invalid: number;
    gaps?: number;
    strict?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<Generation[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const selectedBooks = useMemo(
    () => books.filter((b) => bookIds.includes(b.id)),
    [books, bookIds],
  );

  useEffect(() => {
    api
      .generations(projectId)
      .then(({ generations }) => setHistory(generations))
      .catch(() => setHistory([]));
  }, [projectId, running]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const toggleBook = (id: string) =>
    setBookIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function createProject() {
    if (!newProject.trim()) return;
    const { project } = await api.createProject(newProject);
    setNewProject("");
    await reloadAll();
    setProjectId(project.id);
  }

  async function run() {
    if (!request.trim() || running) return;
    setRunning(true);
    setError(null);
    setOutput("");
    setSources([]);
    setPlan(null);
    setSection(null);
    setGrounding(null);
    setStatus("starting");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamGenerate(
        { request, bookIds, projectId, mode, maxSections },
        (event) => {
          switch (event.type) {
            case "status":
              setStatus(event.detail ?? event.stage);
              break;
            case "sources":
              setSources(event.sources);
              break;
            case "plan":
              setPlan({ title: event.title, sections: event.sections });
              break;
            case "section-start":
              setSection({ index: event.index, total: event.total, title: event.title });
              break;
            case "token":
              setOutput((prev) => prev + event.text);
              break;
            case "done":
              setStatus("");
              setSection(null);
              setGrounding(event.grounding);
              break;
            case "error":
              setError(event.message);
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      void reloadAll();
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
    setStatus("");
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function downloadOutput() {
    const blob = new Blob([output], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `generation-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveAsMemory() {
    if (!projectId || !output.trim()) return;
    const firstLine = output.split("\n").find((l) => l.trim()) ?? "Generated output";
    await api.addMemory(projectId, {
      title: firstLine.replace(/^#+\s*/, "").slice(0, 80),
      content: output.slice(0, 1200),
      kind: "generation",
    });
    void reloadAll();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workbench"
        title="Generate from the book"
        description="Select the books to draw from, describe what you want, and the engine retrieves the relevant passages before generating."
        actions={<Badge tone="ember"><Sparkles className="h-3 w-3" /> {model?.model ?? "no model"}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* left: controls */}
        <div className="space-y-5">
          <Card className="p-5">
            <Label>What should it make?</Label>
            <Textarea
              rows={5}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. Build a C# console app that reads a CSV and groups rows by a column…"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.slice(0, 3).map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setRequest(ex)}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-paper-300/60 transition hover:border-ember-500/30 hover:text-paper-100"
                >
                  example {i + 1}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <Label>Books in scope ({selectedBooks.length})</Label>
              {books.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-paper-300/50">
                  No books yet.{" "}
                  <Link to="/app/library" className="text-ember-400 underline-offset-2 hover:underline">
                    Import one →
                  </Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {books.map((book) => {
                    const active = bookIds.includes(book.id);
                    return (
                      <button
                        key={book.id}
                        onClick={() => toggleBook(book.id)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition ${
                          active
                            ? "border-ember-500/40 bg-ember-500/12 text-ember-400"
                            : "border-white/10 text-paper-300/60 hover:border-white/20"
                        }`}
                      >
                        {book.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <Label>Mode</Label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="w-full rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-ember-500/70"
                >
                  <option value="auto">Auto</option>
                  <option value="single">Single pass</option>
                  <option value="sectioned">Sectioned</option>
                </select>
              </div>
              <div>
                <Label>Project</Label>
                <select
                  value={projectId ?? ""}
                  onChange={(e) => setProjectId(e.target.value || null)}
                  className="w-full rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-ember-500/70"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <Label>Or create a project</Label>
              <div className="flex gap-2">
                <Input
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void createProject()}
                  placeholder="e.g. C# CSV tool"
                />
                <Button variant="secondary" onClick={() => void createProject()} disabled={!newProject.trim()}>
                  <Plus className="h-4 w-4" /> Create
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-paper-300/40">
                A project remembers facts, decisions and past outputs across sessions.
              </p>
            </div>

            {mode !== "single" && (
              <div className="mt-4">
                <Label>Sections for long output: {maxSections}</Label>
                <input
                  type="range"
                  min={2}
                  max={12}
                  value={maxSections}
                  onChange={(e) => setMaxSections(Number(e.target.value))}
                  className="w-full accent-ember-500"
                />
                <p className="mt-1 text-[11px] text-paper-300/40">
                  Long outputs are written part by part so a small model stays coherent.
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <Button onClick={run} disabled={running || !request.trim()} className="flex-1">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {running ? "Generating…" : "Generate"}
              </Button>
              {running && (
                <Button variant="danger" onClick={stop}>
                  <Ban className="h-4 w-4" /> Stop
                </Button>
              )}
            </div>
          </Card>

          {history.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-paper-300/50">
                <History className="h-3.5 w-3.5" /> Recent
              </div>
              <div className="space-y-1.5">
                {history.slice(0, 6).map((gen) => (
                  <button
                    key={gen.id}
                    onClick={() => {
                      setOutput(gen.output);
                      setRequest(gen.prompt);
                      setSources(JSON.parse(gen.used || "[]") as SourceRef[]);
                    }}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-paper-300/70 transition hover:bg-white/[0.04] hover:text-paper-100"
                  >
                    <span className="line-clamp-2">{gen.prompt}</span>
                    <span className="mt-1 flex gap-2 text-[10px] text-paper-300/35">
                      <span>{gen.mode}</span>
                      <span>{new Date(gen.created_at).toLocaleString()}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* right: output */}
        <Card className="flex min-h-[560px] flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <div className="flex items-center gap-2 text-sm text-paper-300/70">
              {running ? (
                <Spinner label={section ? `Part ${section.index}/${section.total}` : status || "working"} />
              ) : output ? (
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-2 text-mint-400">
                    <Check className="h-4 w-4" /> complete
                  </span>
                  {grounding && (
                    <Badge
                      tone={
                        grounding.invalid > 0 ||
                        (grounding.paragraphs > 0 && grounding.cited / grounding.paragraphs < 0.6)
                          ? "warn"
                          : "mint"
                      }
                    >
                      {grounding.strict ? "book-only · " : ""}grounded {grounding.cited}/
                      {grounding.paragraphs}
                      {grounding.invalid > 0 ? ` · ${grounding.invalid} unknown cite` : ""}
                      {grounding.gaps ? ` · ${grounding.gaps} gap${grounding.gaps > 1 ? "s" : ""} flagged` : ""}
                    </Badge>
                  )}
                </span>
              ) : (
                <span className="text-paper-300/40">output</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {output && (
                <>
                  <Button variant="ghost" size="sm" onClick={copyOutput}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadOutput}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {projectId && (
                    <Button variant="ghost" size="sm" onClick={saveAsMemory} title="Remember this in the project">
                      <Plus className="h-3.5 w-3.5" /> Memory
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {plan && plan.sections.length > 0 && (
            <div className="border-b border-white/[0.06] px-5 py-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-paper-300/50">
                <Layers className="h-3.5 w-3.5" /> sectioned plan
              </div>
              <div className="flex flex-wrap gap-1.5">
                {plan.sections.map((s, i) => (
                  <span
                    key={i}
                    className={`rounded-lg border px-2 py-1 text-[11px] ${
                      section && section.index === i + 1
                        ? "border-ember-500/40 bg-ember-500/12 text-ember-400"
                        : "border-white/10 text-paper-300/50"
                    }`}
                  >
                    {i + 1}. {s.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div ref={outputRef} className="flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            ) : output ? (
              <Markdown text={output} />
            ) : running ? (
              <div className="flex h-full items-center justify-center">
                <Spinner label={status || "reading the book…"} />
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles className="h-7 w-7" />}
                title="Your generated output appears here"
                description="Pick the books, describe what you want, and watch it stream out section by section."
              />
            )}
          </div>

          {sources.length > 0 && (
            <div className="border-t border-white/[0.06] px-5 py-3">
              <details>
                <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-paper-300/50">
                  {sources.length} passages retrieved
                </summary>
                <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                  {sources.map((s) => (
                    <div key={s.label} className="rounded-lg border border-white/[0.06] bg-ink-900/60 px-3 py-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-mint-400">{s.label}</span>
                        <span className="text-paper-200/80">{s.bookTitle}</span>
                        <span className="text-paper-300/40">
                          {[s.chapterTitle, s.page != null ? `p.${s.page}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <Snippet
                        text={s.snippet}
                        className="mt-1 line-clamp-2 text-paper-300/50"
                      />
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
