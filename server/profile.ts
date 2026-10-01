import { db } from "./db.ts";
import { bookOutline, getBook, saveBookProfile, terms, type BookProfile } from "./books.ts";
import { chat, getModelConfig } from "./model.ts";
import { extractJson } from "./prompts.ts";

/**
 * A stored "understanding" of a book: what it covers, how it is structured and
 * how it writes. Generated once, reused as a cheap summary so the model does
 * not need to hold the whole book — or world knowledge — in its weights.
 */

interface ChapterSample {
  chapterNo: number | null;
  title: string | null;
  sample: string;
}

function chapterSamples(bookId: string, maxChapters = 40, sampleChars = 700): ChapterSample[] {
  const rows = db
    .query<{ chapter_no: number | null; chapter_title: string | null; text: string }, [string, number]>(
      `SELECT chapter_no, chapter_title, text FROM chunks
       WHERE book_id = ? ORDER BY ord LIMIT ?`,
    )
    .all(bookId, maxChapters * 4);

  const byChapter = new Map<string, ChapterSample>();
  for (const row of rows) {
    const key = `${row.chapter_no ?? "flat"}:${row.chapter_title ?? ""}`;
    if (byChapter.has(key)) continue;
    byChapter.set(key, {
      chapterNo: row.chapter_no,
      title: row.chapter_title,
      sample: row.text.slice(0, sampleChars),
    });
    if (byChapter.size >= maxChapters) break;
  }
  return [...byChapter.values()];
}

function topConcepts(samples: ChapterSample[], limit = 18): string[] {
  const freq = new Map<string, number>();
  for (const s of samples) {
    for (const t of terms(s.sample)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

function fallbackProfile(samples: ChapterSample[]): BookProfile {
  const outline = samples.map((s) => ({
    chapterNo: s.chapterNo,
    title: s.title,
    gist: s.sample.slice(0, 180),
  }));
  return {
    summary: samples.length
      ? `${samples.length} chapters covering ${topConcepts(samples, 8).join(", ")}.`
      : "",
    structure: outline,
    style: "",
    concepts: topConcepts(samples),
    generatedAt: Date.now(),
    model: null,
  };
}

export async function buildBookProfile(bookId: string): Promise<BookProfile> {
  const book = getBook(bookId);
  if (!book) throw new Error("Book not found");
  const samples = chapterSamples(bookId);
  if (!samples.length) throw new Error("Book has no indexed text");

  const digest = samples
    .map((s) => `### ${s.title ?? (s.chapterNo != null ? `Chapter ${s.chapterNo}` : "Passage")}\n${s.sample}`)
    .join("\n\n")
    .slice(0, 22000);

  const outline = bookOutline(bookId);
  const fallback = fallbackProfile(samples);

  try {
    const model = getModelConfig();
    const reply = await chat(
      [
        {
          role: "system",
          content:
            "You analyze the structure of a book from chapter samples. Respond with JSON only: {\"summary\": \"<=120 words\", \"style\": \"<=40 words describing tone/notation/conventions\", \"concepts\": [\"key term\", ...], \"structure\": [{\"chapterNo\": number|null, \"title\": string, \"gist\": \"<=20 words\"}]}",
        },
        {
          role: "user",
          content: `BOOK: ${book.title}${book.author ? ` by ${book.author}` : ""}\n\n${outline
            .slice(0, 40)
            .map((o) => `- ${o.chapterTitle ?? "(untitled)"} (${o.chunks} passages)`)
            .join("\n")}\n\nSAMPLES:\n${digest}\n\nReturn JSON only.`,
        },
      ],
      { model: model.model, temperature: 0.2, maxTokens: Math.min(model.maxTokens, 1200) },
    );
    const parsed = extractJson<{
      summary?: string;
      style?: string;
      concepts?: string[];
      structure?: { chapterNo?: number | null; title?: string; gist?: string }[];
    }>(reply);
    if (parsed && (parsed.summary || parsed.structure?.length)) {
      const profile: BookProfile = {
        summary: (parsed.summary ?? fallback.summary).trim(),
        style: (parsed.style ?? "").trim(),
        concepts: (parsed.concepts ?? fallback.concepts)
          .filter((c): c is string => typeof c === "string")
          .slice(0, 30),
        structure:
          parsed.structure?.length
            ? parsed.structure.slice(0, 60).map((s) => ({
                chapterNo: s.chapterNo ?? null,
                title: s.title ?? null,
                gist: s.gist ?? "",
              }))
            : fallback.structure,
        generatedAt: Date.now(),
        model: model.model,
      };
      saveBookProfile(bookId, profile);
      return profile;
    }
  } catch {
    /* offline or model error — keep the heuristic profile */
  }

  saveBookProfile(bookId, fallback);
  return fallback;
}
