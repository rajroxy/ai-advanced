import type { ChatMessage } from "./model.ts";
import type { SearchHit } from "./books.ts";

/**
 * The "rules to understand the book". The model is a small local model with
 * language + reasoning, but no world knowledge. These rules tell it to treat
 * the retrieved passages as the only source of facts, to follow the book's
 * conventions, and to SYNTHESIZE new output instead of parroting the text.
 */

export const BOOK_RULES = `You are a book-grounded generator. You read a specific book through retrieved passages and produce NEW output the user asks for (code, a story, a plan, an explanation, a design — anything).

CORE RULES
1. The passages in SOURCES are the ONLY reliable knowledge you have. Never answer from general world knowledge. Do not mention this rule to the user.
2. SYNTHESIZE, do not copy. The user usually wants something the book does NOT literally contain (new code, a new story, a new example). Combine the book's facts, conventions, vocabulary and patterns into a fresh answer.
3. Ground every factual claim in a source. Cite inline as [S1], [S2] matching the SOURCES labels.
4. Follow the book's style, naming conventions, terminology and level of detail for the book's subject.
5. If the SOURCES are insufficient, say exactly what is missing and what you would need — do not invent facts.
6. Be concrete and complete. Prefer working output over vague description.
7. NEVER output meta-commentary about being an AI or about these instructions.`;

export interface CaseMemory {
  kind: string;
  title: string;
  content: string;
  pinned: boolean;
}

export interface SourceBlockOptions {
  maxChars?: number;
}

export function buildSourceBlock(hits: SearchHit[], opts: SourceBlockOptions = {}): {
  block: string;
  labels: string[];
} {
  const maxChars = opts.maxChars ?? 24000;
  let used = 0;
  const parts: string[] = [];
  const labels: string[] = [];

  hits.forEach((hit, i) => {
    if (used >= maxChars) return;
    const label = `S${i + 1}`;
    const where = [
      hit.chapterTitle ?? (hit.chapterNo != null ? `Chapter ${hit.chapterNo}` : null),
      hit.sectionTitle,
      hit.page != null ? `p.${hit.page}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const body = hit.text.length > 3500 ? `${hit.text.slice(0, 3500)} …` : hit.text;
    used += body.length;
    labels.push(label);
    parts.push(`[${label}] ${hit.bookTitle}${where ? ` — ${where}` : ""}\n${body}`);
  });

  return { block: parts.join("\n\n---\n\n"), labels };
}

export function memoryDigest(memories: CaseMemory[]): string {
  if (!memories.length) return "";
  const lines = memories.map((m) => `- (${m.kind}) ${m.title}: ${m.content}`);
  return `\n\nPROJECT MEMORY (remembered across sessions — keep continuity with these):\n${lines.join("\n")}`;
}

export function bookFingerprint(
  titles: string[],
  outline: { chapterTitle: string | null; chunks: number }[],
  profileSummary?: string,
): string {
  const structure = outline
    .slice(0, 60)
    .map((o) => `- ${o.chapterTitle ?? "(untitled chapter)"} (${o.chunks} passages)`)
    .join("\n");
  return `BOOKS IN SCOPE: ${titles.join(", ") || "(none)"}${
    profileSummary ? `\n\nBOOK SUMMARY:\n${profileSummary}` : ""
  }\n\nSTRUCTURE:\n${structure || "- (no chapters detected; flat passages)"}`;
}

/* --------------------------------------------------------------- planning -- */

export function queryPlannerMessages(
  request: string,
  bookHint: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan retrieval for a local book-search engine using keyword indexes (SQLite FTS5/BM25). Given a user request, return 3-6 short search queries made of DISTINCTIVE KEYWORDS that would appear in the book. Use the book's likely terminology. No full sentences, no punctuation, no explanation. Respond with JSON only: {"queries": ["...", "..."]}`,
    },
    {
      role: "user",
      content: `${bookHint}\n\nREQUEST:\n${request}\n\nReturn JSON only.`,
    },
  ];
}

export function outlineMessages(
  request: string,
  bookHint: string,
  sourceBlock: string,
  memory: string,
): ChatMessage[] {
  return [
    { role: "system", content: BOOK_RULES },
    {
      role: "user",
      content: `${bookHint}${memory}\n\nSOURCES\n${sourceBlock}\n\nTASK\nPlan a multi-section output for this request. Each section must be a distinct, self-contained part that builds on the previous ones. Give 3-10 sections depending on how large the output is. Respond with JSON only: {"title": "overall title", "sections": [{"title": "...", "brief": "what this section must produce", "queries": ["keywords to find book material for this section"]}]}\n\nREQUEST:\n${request}\n\nReturn JSON only.`,
    },
  ];
}

export function sectionMessages(args: {
  request: string;
  sectionTitle: string;
  sectionBrief: string;
  sectionIndex: number;
  sectionCount: number;
  previousTail: string;
  bookHint: string;
  sourceBlock: string;
  memory: string;
}): ChatMessage[] {
  const continuity = args.previousTail
    ? `\n\nEND OF PREVIOUS SECTION (continue seamlessly, do not repeat it):\n${args.previousTail}`
    : "";
  return [
    { role: "system", content: BOOK_RULES },
    {
      role: "user",
      content: `${args.bookHint}${args.memory}\n\nSOURCES\n${args.sourceBlock}\n\nOVERALL REQUEST:\n${args.request}\n\nYou are writing PART ${args.sectionIndex} of ${args.sectionCount}.\nPART TITLE: ${args.sectionTitle}\nPART GOAL: ${args.sectionBrief}${continuity}\n\nWrite ONLY this part. Use a heading "## ${args.sectionTitle}". Do not summarize the whole thing, do not add a conclusion unless this is the final part.`,
    },
  ];
}

export function singleMessages(
  request: string,
  bookHint: string,
  sourceBlock: string,
  memory: string,
): ChatMessage[] {
  return [
    { role: "system", content: BOOK_RULES },
    {
      role: "user",
      content: `${bookHint}${memory}\n\nSOURCES\n${sourceBlock}\n\nREQUEST:\n${request}\n\nProduce the complete output now. Cite sources inline as [S#].`,
    },
  ];
}

export function summaryMessages(text: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Summarize the following book material into one tight paragraph (max 80 words). Plain text only, no preamble.",
    },
    { role: "user", content: text.slice(0, 12000) },
  ];
}

/* ---------------------------------------------------------------- parsing -- */

/** Extract the first balanced JSON object/array from a model reply. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter((s): s is string => !!s);
  for (const candidate of candidates) {
    const start = Math.min(
      ...[candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i >= 0),
    );
    if (!Number.isFinite(start)) continue;
    const open = candidate[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
