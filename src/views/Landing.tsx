import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  BrainCircuit,
  Cpu,
  FileSearch,
  Layers,
  Lock,
  Sparkles,
  Terminal,
  Workflow,
} from "lucide-react";
import { Badge, Button, Card } from "../components/ui";

const STEPS = [
  {
    icon: BookOpen,
    title: "Import the book",
    body: "Drop in a structured book — JSON chapters, a text export, or rows in a SQLite file. A 50,000-page textbook is fine.",
  },
  {
    icon: FileSearch,
    title: "Index once",
    body: "Every passage is chunked and indexed with SQLite FTS5. From then on the engine greps an inverted index — never re-reads page one.",
  },
  {
    icon: BrainCircuit,
    title: "Read the rules",
    body: "A stored profile captures the book's structure, style and concepts, so a tiny model can understand it without world knowledge in its weights.",
  },
  {
    icon: Sparkles,
    title: "Generate anything",
    body: "Ask for code, a story, a design, a plan. The model synthesizes new output grounded in the passages it retrieved — and cites them.",
  },
];

const FEATURES = [
  {
    icon: Cpu,
    title: "Runs on a small model",
    body: "1.5B–8B params, quantized, CPU-only. No GPU, no cluster, no API bills. The book carries the knowledge; the model carries the language.",
  },
  {
    icon: Layers,
    title: "Sectioned long output",
    body: "Small models choke on one giant generation. The engine plans an outline, then writes it section by section, carrying continuity forward.",
  },
  {
    icon: Boxes,
    title: "Project memory",
    body: "A local SQLite memory remembers decisions and facts for each project, so a new session picks up where the last one stopped.",
  },
  {
    icon: FileSearch,
    title: "Instant find",
    body: "Type any phrase and the BM25 index returns highlighted passages in milliseconds — the grep-and-find behaviour, not a linear scan.",
  },
  {
    icon: Lock,
    title: "Fully offline",
    body: "Model host, index and UI all live on your machine through an OpenAI-compatible endpoint. Nothing is uploaded anywhere.",
  },
  {
    icon: Workflow,
    title: "Rules, not training",
    body: "No fine-tuning, no book baked into weights. Understanding comes from retrieval plus an explicit rules layer you can read and edit.",
  },
];

export default function Landing() {
  return (
    <div className="app-backdrop min-h-screen">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ember-500/15 text-ember-400">
            <BookOpen className="h-[18px] w-[18px]" />
          </div>
          <div>
            <p className="font-display text-lg leading-none text-paper-100">Cortex Book</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-paper-300/40">
              local book intelligence
            </p>
          </div>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-paper-300/70 md:flex">
          <a href="#how" className="transition hover:text-paper-100">How it works</a>
          <a href="#features" className="transition hover:text-paper-100">Capabilities</a>
          <a href="#offline" className="transition hover:text-paper-100">Offline</a>
        </nav>
        <Link to="/app">
          <Button size="sm">
            Open workspace <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="animate-fade-up">
          <Badge tone="ember">
            <Terminal className="h-3 w-3" /> runs on your machine
          </Badge>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] text-paper-100 sm:text-6xl">
            Read a book once.
            <br />
            <span className="bg-gradient-to-r from-ember-400 via-ember-500 to-mint-400 bg-clip-text text-transparent">
              Generate anything.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper-300/75">
            A small offline model that reads a full textbook — 50k pages or more — then produces
            custom code, stories, plans and explanations from what it learned. No world knowledge in
            the weights. No uploads. No cloud.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/app">
              <Button>
                Enter the workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how">
              <Button variant="ghost">See how it works</Button>
            </a>
          </div>
          <p className="mt-5 text-xs text-paper-300/40">
            Works with Ollama · llama.cpp · LM Studio · OpenLLM · vLLM — any OpenAI-compatible
            local endpoint.
          </p>
        </div>

        {/* mock panel */}
        <div className="animate-fade-up rounded-2xl border border-white/[0.07] bg-ink-850/80 p-1.5 shadow-glow">
          <div className="rounded-xl bg-ink-900/80 p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-mint-400/70" />
              <span className="ml-2 font-mono text-[11px] text-paper-300/40">
                generate — full C# reference
              </span>
            </div>
            <div className="space-y-3 text-[13px]">
              <div className="rounded-lg border border-white/5 bg-ink-850/60 px-3 py-2 font-mono text-paper-200/80">
                <span className="text-ember-400">›</span> build me a console app that reads a CSV and
                groups rows by column
              </div>
              <div className="rounded-lg border border-mint-500/15 bg-mint-500/[0.06] px-3 py-2 font-mono text-[11px] text-mint-400/90">
                found 12 passages · ch.9 streams · ch.14 collections · p.412 File I/O
              </div>
              <div className="rounded-lg border border-white/5 bg-ink-950/60 p-3 font-mono text-[11.5px] leading-relaxed text-paper-200/85">
                <div className="text-paper-300/40">## Reading & grouping</div>
                <div>
                  <span className="text-ember-400">class</span> CsvGroup{" "}
                  <span className="text-paper-300/50">{"{"}</span>
                </div>
                <div className="pl-4">
                  <span className="text-mint-400">public</span> Dictionary&lt;string, List&lt;Row&gt;&gt; Group(
                </div>
                <div className="pl-6">string path, string column) {"{"}</div>
                <div className="pl-8 text-paper-300/60">
                  // uses the book's pattern: StreamReader + LINQ grouping
                </div>
                <div className="pl-8">…</div>
                <div className="pl-4">{"}"}</div>
                <div>
                  <span className="text-paper-300/50">{"}"}</span>{" "}
                  <span className="rounded border border-mint-500/30 bg-mint-500/10 px-1 font-mono text-[10px] text-mint-400">
                    S3
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* steps */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-ember-400/80">
          The pipeline
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-paper-100">
          Four moves, all offline
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-ember-500/12 text-ember-400">
                  <step.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-2xl text-white/10">0{i + 1}</span>
              </div>
              <h3 className="font-display text-lg text-paper-100">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-300/65">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-ember-400/80">
              Capabilities
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-paper-100">
              Built for weak hardware and huge books
            </h2>
          </div>
          <p className="max-w-sm text-sm text-paper-300/60">
            Everything the model needs to sound like it read the book lives in a searchable index,
            not in its parameters.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="p-5 transition hover:border-ember-500/20">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-mint-400">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg text-paper-100">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-300/65">{feature.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* offline contrast */}
      <section id="offline" className="mx-auto max-w-6xl px-6 py-16">
        <Card className="overflow-hidden">
          <div className="grid gap-8 p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <Badge tone="mint">
                <Lock className="h-3 w-3" /> private by construction
              </Badge>
              <h2 className="mt-4 font-display text-3xl font-semibold text-paper-100">
                The book never enters the weights
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-paper-300/70">
                We don't train, fine-tune or upload anything. The book sits in a local SQLite file;
                the model only ever sees the handful of passages a query retrieves. That is why a
                tiny model on a laptop can reason about a 100,000-page textbook.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                ["Where the knowledge lives", "Local SQLite index (FTS5)"],
                ["What the model provides", "Language · reasoning · format"],
                ["How understanding is set", "Editable rules + book profile"],
                ["Model host", "Local, OpenAI-compatible"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-ink-900/60 px-4 py-3"
                >
                  <span className="text-sm text-paper-300/60">{k}</span>
                  <span className="font-mono text-xs text-mint-400/90">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-6">
        <div className="relative overflow-hidden rounded-3xl border border-ember-500/20 bg-gradient-to-br from-ember-500/[0.12] via-ink-850 to-mint-500/[0.08] px-8 py-14 text-center">
          <h2 className="font-display text-4xl font-semibold text-paper-100">
            Point it at a book and ask for something new
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-paper-300/70">
            Import your first book, connect your local model, and generate a program, a story or a
            study guide grounded in the text.
          </p>
          <div className="mt-8 flex justify-center">
            <Link to="/app">
              <Button>
                Open the workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-xs text-paper-300/40">
          <span>Cortex Book — local-first book intelligence engine</span>
          <span className="font-mono">SQLite FTS5 · sectioned generation · fully offline</span>
        </div>
      </footer>
    </div>
  );
}
