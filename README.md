# Cortex Book — local book intelligence

Read a book once. Generate anything.

A fully local engine: a small offline AI model reads a large structured book
(JSON, plain text, or rows in a SQLite file) and produces **custom outputs** —
code, a story, a design, a plan — grounded in what it read, with citations.

Nothing is uploaded. No cloud. No fine-tuning. The book never enters the model
weights.

## How it works

```
book (JSON / text / SQLite)
        │  chunk + index once
        ▼
SQLite + FTS5 inverted index      ← instant "grep/find", never reads page 1 again
        │  query → plan → retrieve top passages
        ▼
rules layer (book profile + prompt rules)  ← the "understanding" of the book
        │  single pass, or outline → section-by-section for long output
        ▼
local OpenAI-compatible model (Ollama / llama.cpp / LM Studio / OpenLLM / vLLM)
        ▼
custom output, streamed, with [S#] citations
```

Why a *small* model is enough: language, reasoning and instruction-following
live in the weights; **knowledge lives in the index**. The model only ever sees
the handful of passages a query retrieves, so a 1.5B–8B quantized model on a
CPU-only laptop can reason about a 50,000-page textbook.

Small models are weak at one giant generation, so long outputs are planned into
sections, written one at a time, and stitched with continuity carried forward.

## Requirements

- [Bun](https://bun.sh) (the engine and dev server run on Bun)
- A local model server exposing an OpenAI-compatible API, e.g. Ollama:

```bash
bun run model                 # starts Ollama, pulls a model, wires it up, verifies it
bun run model llama3.2:3b     # or any other Ollama tag
```

`bun run model` finds Ollama, starts its server if nothing is on the port,
downloads the model, points the engine at it and checks the connection. If you
prefer a different host (LM Studio, llama.cpp, vLLM), start it yourself and set
its base URL in **Settings** instead.

### Connecting Ollama (it does have `/v1`)

Ollama exposes an OpenAI-compatible API under `/v1` — the engine talks to it the
same way it would talk to OpenAI:

```bash
ollama serve                 # keep this running (it listens on 127.0.0.1:11434)
curl http://127.0.0.1:11434/v1/models        # should list your models
ollama list                  # shows qwen2.5-coder:7b once it is downloaded
```

Then in the app's **Settings**: Base URL `http://127.0.0.1:11434/v1`, Model
`qwen2.5-coder:7b` (or the name `ollama list` shows), and press **Test
connection**. A `404` almost always means `ollama serve` is not running, or a
path was typed after `/v1` — the base URL stops at `/v1`, the engine appends
`/chat/completions` itself.

## Run

```bash
bun install
bun run dev
```

Then open the printed `PORT`. Set the model base URL and name in **Settings**
(default `http://127.0.0.1:11434/v1`).

Production-style single process (serves `dist/` + the API):

```bash
bun run build
bun run start
```

## Get the book / bring your own

A book is just a JSON file. Two ways in:

- **Download and import yourself.** Open **Library → Download a book, then import it**,
  grab `javascript-the-complete-local-reference.json`, keep the file, then bring it
  back with **Import book → Upload file**. The same file works on any machine and
  round-trips exactly.
- **Index the bundled copy.** `bun run seed` merges `books/javascript/*.json` and
  indexes it. The bundled JavaScript reference is **92 chapters / 143 pages /
  ~83,000 words** across parts I–XX: language fundamentals, the standard library,
  Node.js internals, algorithms and data structures, application architecture,
  and **part XX, 28 complete worked programs** with real code. Every chapter
  carries runnable code examples inline, between the prose sections.
- **Regenerate the downloadable file.** `bun run book` repacks the bundled book
  into a single importable JSON in `public/`, served at
  `/javascript-the-complete-local-reference.json` and copied into `dist/` by the
  build.

### How pages are counted

The part files store one entry per paragraph, which is convenient to write and
wrong to print. On load, each chapter is divided into the number of pages that
best fits its length, so pages come out at roughly 2,900–5,200 characters (about
480–850 words — one or two word-processor pages) instead of one short paragraph
each. A page that runs on into the next subsection keeps that subsection's
heading inline, and a chapter always starts on a fresh page, as in print.

Total length is the honest size measure: **~83,000 words**. Page numbers in
citations are page numbers you could look up in a printed edition, not paragraph
indices.

`GET /api/books/:id/export` returns any indexed book as the same importable shape,
and `GET /api/books/bundled/:source` returns a bundled book that has not been
indexed yet.

## Bringing your own model's knowledge under control

You cannot strip facts out of model weights and keep only "language plus
reasoning" — knowledge and language are entangled in the same parameters, and
fine-tuning-to-forget, abliteration and pruning all cause catastrophic forgetting.
Quantisation is lossy number compression, not knowledge removal. "Language +
reasoning only" is not a carveable subset of the weights.

The engine therefore does not try, and instead keeps knowledge **outside** the
weights and makes the constraint checkable:

1. The book is the only admissible fact source; the model sees only retrieved passages.
2. **Book-only strict mode** (Settings, on by default) tells the model that anything
   it knows from training is unavailable, requires a `[S#]` citation on every
   factual sentence, and requires a gap to be reported as `[not in book]` instead
   of filled from memory.
3. Every run ends with a **grounding audit** — `grounded N/M`, unknown citations
   and flagged gaps — so an unsupported answer is visible rather than implicit.

### Editing the model yourself

`bun run model:book` does two things and both are real:

1. **Wrap it.** It writes `data/model/Modelfile` and runs `ollama create`, which
   produces a *new* model you own, derived from a base model, with the strict
   book-only rules and generation settings baked in. `ollama show cortex-book`
   prints the whole definition; edit the Modelfile and re-run to re-edit it.
2. **Train it.** It writes `data/model/train.jsonl` + `valid.jsonl` (274 chat
   examples built only from this book) and prints the exact `llama-finetune` /
   Unsloth commands and how to load the resulting LoRA back into Ollama.

Pass the base model explicitly if it is not the one already stored in Settings:

```bash
bun run model:book qwen2.5-coder:7b     # wrap your downloaded model
```

Fine-tuning pushes the book into the weights. It does not delete the base
model's other knowledge, and nothing does — the parameters are shared. A model
with genuinely zero outside knowledge has to be trained from scratch on the
book alone; the dataset this command produces is the starting point for that.

## Book formats

Structured JSON (best citations):

```json
{
  "title": "C# Complete",
  "author": "...",
  "subject": "C#",
  "chapters": [
    {
      "number": 1,
      "title": "Basics",
      "sections": [
        { "title": "Variables", "pages": [ { "page": 1, "text": "..." } ] }
      ]
    }
  ]
}
```

Also accepted: a single string / `text` field, a flat `sections` or `pages`
array, or a SQLite file (give a table and columns in the Library import dialog).

## Where things live

| Path | Purpose |
| --- | --- |
| `server/db.ts` | SQLite schema + FTS5 tables and triggers |
| `server/books.ts` | Book normalization, chunking, import, instant search |
| `server/retrieve.ts` | Query planning and passage retrieval |
| `server/prompts.ts` | The book-understanding rules and prompt builders |
| `server/generate.ts` | Single-pass and sectioned generation engine |
| `server/memory.ts` | Project memory (facts, decisions, history) |
| `server/model.ts` | Local OpenAI-compatible client (streaming) |
| `server/profile.ts` | Stored "understanding" of a book |
| `src/` | React workspace UI |

Local data (books, memories, generations) is stored in `data/cortex.db`, which
is git-ignored. Bundled books are plain data under `books/<source>/*.json`; add a
directory there and `bun run seed <source>` will index it, and it will show up in
the download list automatically.
