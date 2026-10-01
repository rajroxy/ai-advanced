import { db, newId, now } from "./db.ts";
import { search, terms, type SearchHit } from "./books.ts";
import { chat, chatStream, getModelConfig, getPlannerConfig } from "./model.ts";
import {
  buildSourceBlock,
  extractJson,
  memoryDigest,
  outlineMessages,
  sectionMessages,
  singleMessages,
} from "./prompts.ts";
import { buildBookHint, mergeHits, retrieve } from "./retrieve.ts";
import { memoryContext } from "./memory.ts";

/**
 * Generation engine.
 *
 * Small local models are weak at very long single outputs, so for big asks
 * (a whole program, a long story) we plan the output into sections, retrieve
 * book material per section, and stream each section in turn. Small asks run
 * in a single pass. Both modes are grounded in the same retrieved passages.
 */

export type GenMode = "auto" | "single" | "sectioned";

export interface GenRequest {
  request: string;
  bookIds: string[];
  projectId?: string | null;
  mode?: GenMode;
  maxSections?: number;
  temperature?: number;
}

export interface SourceRef {
  label: string;
  bookId: string;
  bookTitle: string;
  chapterNo: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  page: number | null;
  snippet: string;
}

export type GenEvent =
  | { type: "status"; stage: string; detail?: string }
  | { type: "plan"; mode: "single" | "sectioned"; title?: string; sections: { title: string; brief: string }[] }
  | { type: "sources"; sources: SourceRef[] }
  | { type: "section-start"; index: number; total: number; title: string }
  | { type: "token"; text: string }
  | { type: "done"; generationId: string; mode: "single" | "sectioned" }
  | { type: "error"; message: string };

function toSources(hits: SearchHit[]): SourceRef[] {
  return hits.map((hit, i) => ({
    label: `S${i + 1}`,
    bookId: hit.bookId,
    bookTitle: hit.bookTitle,
    chapterNo: hit.chapterNo,
    chapterTitle: hit.chapterTitle,
    sectionTitle: hit.sectionTitle,
    page: hit.page,
    snippet: hit.snippet.replace(/\s+/g, " ").slice(0, 240),
  }));
}

export function autoMode(request: string): "single" | "sectioned" {
  const longSignal =
    /\b(full|complete|entire|whole|long|detailed|in-?depth|step[- ]by[- ]step|program|application|project|codebase|novel|story|book|chapter|essay|guide|tutorial|from scratch|multiple|system|architecture)\b/i;
  if (longSignal.test(request)) return "sectioned";
  if (request.length > 200) return "sectioned";
  return "single";
}

function fallbackSections(hits: SearchHit[], max: number): { title: string; brief: string; queries: string[] }[] {
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const key = hit.chapterTitle ?? (hit.chapterNo != null ? `Chapter ${hit.chapterNo}` : "Core material");
    const list = groups.get(key) ?? [];
    list.push(hit);
    groups.set(key, list);
  }
  return [...groups.entries()].slice(0, max).map(([title, list]) => ({
    title,
    brief: `Produce this part of the output using the book's material on "${title}".`,
    queries: terms(list.map((h) => h.text).join(" ")).slice(0, 8),
  }));
}

async function planSections(
  request: string,
  bookHint: string,
  sourceBlock: string,
  memory: string,
  hits: SearchHit[],
  max: number,
): Promise<{ title: string; sections: { title: string; brief: string; queries: string[] }[] }> {
  const planner = getPlannerConfig();
  try {
    const reply = await chat(outlineMessages(request, bookHint, sourceBlock, memory), {
      model: planner.enabled && planner.model ? planner.model : getModelConfig().model,
      temperature: 0.3,
      maxTokens: planner.enabled ? planner.maxTokens : 900,
    });
    const parsed = extractJson<{
      title?: string;
      sections?: { title?: string; brief?: string; queries?: string[] }[];
    }>(reply);
    const sections = (parsed?.sections ?? [])
      .filter((s) => s && (s.title || s.brief))
      .slice(0, max)
      .map((s) => ({
        title: (s.title ?? "Part").trim(),
        brief: (s.brief ?? "").trim(),
        queries: (s.queries ?? []).filter((q): q is string => typeof q === "string"),
      }));
    if (sections.length >= 2) return { title: parsed?.title?.trim() || "", sections };
  } catch {
    /* fall through to heuristic plan */
  }
  return { title: "", sections: fallbackSections(hits, max) };
}

export async function* runGeneration(req: GenRequest): AsyncGenerator<GenEvent> {
  const model = getModelConfig();
  try {
    const memories = memoryContext(req.projectId, req.request);
    const memory = memoryDigest(memories);
    const bookHint = buildBookHint(req.bookIds);

    yield { type: "status", stage: "retrieving", detail: "Searching the book index" };
    const hits = await retrieve({
      request: req.request,
      bookIds: req.bookIds,
      limit: model.contextChunks,
    });
    if (!hits.length) {
      yield {
        type: "error",
        message:
          "No book passages matched. Import a book and select it, or use different wording.",
      };
      return;
    }
    const { block } = buildSourceBlock(hits);
    yield { type: "sources", sources: toSources(hits) };

    const requested = req.mode && req.mode !== "auto" ? req.mode : autoMode(req.request);
    const maxSections = Math.min(Math.max(req.maxSections ?? 6, 2), 12);
    const temperature = req.temperature ?? model.temperature;

    let output = "";
    let mode: "single" | "sectioned";

    if (requested === "single") {
      mode = "single";
      yield { type: "plan", mode: "single", sections: [] };
      yield { type: "status", stage: "generating", detail: "Single-pass generation" };
      for await (const delta of chatStream(
        singleMessages(req.request, bookHint, block, memory),
        { temperature, maxTokens: model.maxTokens },
      )) {
        output += delta;
        yield { type: "token", text: delta };
      }
    } else {
      mode = "sectioned";
      yield { type: "status", stage: "planning", detail: "Planning sections for a long output" };
      const plan = await planSections(req.request, bookHint, block, memory, hits, maxSections);
      yield { type: "plan", mode: "sectioned", title: plan.title, sections: plan.sections };
      if (plan.title) {
        output += `# ${plan.title}\n\n`;
        yield { type: "token", text: `# ${plan.title}\n\n` };
      }

      let previousTail = "";
      for (let i = 0; i < plan.sections.length; i++) {
        const section = plan.sections[i];
        yield { type: "section-start", index: i + 1, total: plan.sections.length, title: section.title };

        const sectionHits = mergeHits([
          ...hits,
          ...section.queries.flatMap((q) => search(q, { bookIds: req.bookIds, limit: 6 })),
          ...search(`${section.title} ${section.brief}`, { bookIds: req.bookIds, limit: 6 }),
        ]).slice(0, Math.max(model.contextChunks, 8));
        const { block: sectionBlock } = buildSourceBlock(sectionHits, { maxChars: 16000 });

        let sectionText = "";
        for await (const delta of chatStream(
          sectionMessages({
            request: req.request,
            sectionTitle: section.title,
            sectionBrief: section.brief,
            sectionIndex: i + 1,
            sectionCount: plan.sections.length,
            previousTail,
            bookHint,
            sourceBlock: sectionBlock,
            memory,
          }),
          { temperature, maxTokens: model.maxTokens },
        )) {
          sectionText += delta;
          output += delta;
          yield { type: "token", text: delta };
        }
        previousTail = sectionText.slice(-1200);
      }
    }

    const generationId = newId();
    db.query(
      `INSERT INTO generations(id, project_id, book_ids, prompt, output, model, mode, used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      generationId,
      req.projectId ?? null,
      JSON.stringify(req.bookIds),
      req.request,
      output,
      model.model,
      mode,
      JSON.stringify(toSources(hits)),
      now(),
    );
    yield { type: "done", generationId, mode };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/* -------------------------------------------------------------- history ---- */

export interface GenerationRow {
  id: string;
  project_id: string | null;
  book_ids: string;
  prompt: string;
  output: string;
  model: string | null;
  mode: string;
  used: string;
  created_at: number;
}

export function listGenerations(projectId?: string | null, limit = 30): GenerationRow[] {
  return projectId
    ? db
        .query<GenerationRow, [string, number]>(
          "SELECT * FROM generations WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .all(projectId, limit)
    : db
        .query<GenerationRow, [number]>(
          "SELECT * FROM generations ORDER BY created_at DESC LIMIT ?",
        )
        .all(limit);
}

export function deleteGeneration(id: string): void {
  db.query("DELETE FROM generations WHERE id = ?").run(id);
}
