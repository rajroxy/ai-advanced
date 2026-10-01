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
ollama serve
ollama pull qwen2.5:7b        # any small instruct model works
```

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
is git-ignored.
