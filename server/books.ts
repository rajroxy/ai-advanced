import { Database } from "bun:sqlite";
import { db, newId, now } from "./db.ts";

/**
 * Books are plain data, not model weights. A book can arrive as structured
 * JSON (chapters -> sections -> pages) or as rows inside a SQLite file. Either
 * way it is flattened into numbered passages and indexed with FTS5 so the AI
 * can jump straight to the relevant lines instead of reading from page one.
 */

export interface RawPage {
  page?: number;
  text?: string;
  content?: string;
}

export interface RawSection {
  title?: string;
  heading?: string;
  text?: string;
  content?: string;
  body?: string;
  pages?: (RawPage | string)[];
}

export interface RawChapter {
  number?: number;
  no?: number;
  title?: string;
  heading?: string;
  text?: string;
  content?: string;
  body?: string;
  pages?: (RawPage | string)[];
  sections?: RawSection[];
}

export interface RawBook {
  title?: string;
  name?: string;
  author?: string;
  subject?: string;
  language?: string;
  content?: string;
  text?: string;
  body?: string;
  chapters?: RawChapter[];
  sections?: RawSection[];
  pages?: (RawPage | string)[];
  entries?: (RawPage | string)[];
  [key: string]: unknown;
}

export interface Passage {
  chapterNo: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  page: number | null;
  ord: number;
  text: string;
}

export interface NormalizedBook {
  title: string;
  author: string | null;
  subject: string | null;
  passages: Passage[];
}

export interface ImportSummary {
  bookId: string;
  title: string;
  chunks: number;
  pages: number;
  chapters: number;
  characters: number;
}

/* --------------------------------------------------------- chunk helper ---- */

const TARGET_CHUNK = 1400;
const OVERLAP = 220;

/** Split long text on sentence/paragraph boundaries into overlapping chunks. */
export function chunkText(text: string, target = TARGET_CHUNK, overlap = OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];

  const units = clean
    .split(/\n{2,}|(?<=[.!?;:])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  for (const unit of units) {
    if (buf && buf.length + unit.length + 1 > target) {
      chunks.push(buf.trim());
      const tail = overlap > 0 ? buf.slice(-overlap) : "";
      buf = tail ? `${tail} ${unit}` : unit;
    } else {
      buf = buf ? `${buf} ${unit}` : unit;
    }
    while (buf.length > target * 1.6) {
      chunks.push(buf.slice(0, target).trim());
      buf = buf.slice(target - overlap);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.map((c) => c.trim()).filter(Boolean);
}

/* ---------------------------------------------------------- normalization -- */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function passageText(p: RawPage | string): string {
  if (typeof p === "string") return str(p);
  return str(p.text) || str(p.content);
}

interface PageText {
  text: string;
  page: number | null;
}

function collectPages(
  container: { pages?: (RawPage | string)[]; entries?: (RawPage | string)[] },
): PageText[] {
  const list = container.pages ?? container.entries ?? [];
  return list
    .map((p, i) => {
      if (typeof p === "string") return { text: str(p), page: null };
      const explicit = typeof p.page === "number" ? p.page : null;
      return { text: passageText(p), page: explicit ?? i + 1 };
    })
    .filter((p) => p.text.length > 0);
}

function fallbackText(c: { text?: string; content?: string; body?: string }): string {
  return str(c.text) || str(c.content) || str(c.body);
}

export function normalizeBook(input: RawBook | string): NormalizedBook {
  if (typeof input === "string") {
    return { title: "Untitled book", author: null, subject: null, passages: toPassages([input]) };
  }

  const title = str(input.title) || str(input.name) || "Untitled book";
  const author = str(input.author) || null;
  const subject = str(input.subject) || null;

  const passages: Passage[] = [];
  let ord = 0;
  const push = (
    text: string,
    chapterNo: number | null,
    chapterTitle: string | null,
    sectionTitle: string | null,
    page: number | null,
  ) => {
    for (const chunk of chunkText(text)) {
      passages.push({ chapterNo, chapterTitle, sectionTitle, page, ord: ord++, text: chunk });
    }
  };

  const chapters = input.chapters ?? [];
  if (chapters.length) {
    chapters.forEach((chapter, ci) => {
      const chapterNo = chapter.number ?? chapter.no ?? ci + 1;
      const chapterTitle = str(chapter.title) || str(chapter.heading) || `Chapter ${chapterNo}`;

      const sections = chapter.sections ?? [];
      if (sections.length) {
        sections.forEach((section) => {
          const sectionTitle =
            str(section.title) || str(section.heading) || `${chapterTitle} - section`;
          const pageTexts = collectPages(section);
          if (pageTexts.length) {
            pageTexts.forEach((pt) => push(pt.text, chapterNo, chapterTitle, sectionTitle, pt.page));
          } else {
            const body = fallbackText(section);
            if (body) push(body, chapterNo, chapterTitle, sectionTitle, null);
          }
        });
      }

      const chapterPages = collectPages(chapter);
      if (chapterPages.length) {
        chapterPages.forEach((pt) => push(pt.text, chapterNo, chapterTitle, null, pt.page));
      } else if (!sections.length) {
        const body = fallbackText(chapter);
        if (body) push(body, chapterNo, chapterTitle, null, null);
      }
    });
  } else {
    const sections = input.sections ?? [];
    if (sections.length) {
      sections.forEach((section, si) => {
        const sectionTitle = str(section.title) || str(section.heading) || `Section ${si + 1}`;
        const pageTexts = collectPages(section);
        if (pageTexts.length) {
          pageTexts.forEach((pt) => push(pt.text, null, null, sectionTitle, pt.page));
        } else {
          const body = fallbackText(section);
          if (body) push(body, null, null, sectionTitle, null);
        }
      });
    } else {
      const topPages = collectPages(input);
      if (topPages.length) {
        topPages.forEach((pt) => push(pt.text, null, null, null, pt.page));
      } else {
        const body = fallbackText(input);
        if (body) push(body, null, null, null, null);
      }
    }
  }

  return { title, author, subject, passages };
}

function toPassages(blocks: string[]): Passage[] {
  const passages: Passage[] = [];
  let ord = 0;
  blocks.forEach((block) => {
    for (const chunk of chunkText(block)) {
      passages.push({ chapterNo: null, chapterTitle: null, sectionTitle: null, page: null, ord: ord++, text: chunk });
    }
  });
  return passages;
}

/* -------------------------------------------------------------- importing -- */

export function importBook(input: RawBook | string, sourceFormat = "json"): ImportSummary {
  const normalized = normalizeBook(input);
  if (!normalized.passages.length) {
    throw new Error("No readable text found in this book payload.");
  }
  return persistBook(normalized, sourceFormat, {});
}

function persistBook(
  book: NormalizedBook,
  sourceFormat: string,
  meta: Record<string, unknown>,
): ImportSummary {
  const bookId = newId();
  const pages = new Set(book.passages.map((p) => p.page).filter((p): p is number => p != null));
  const chapters = new Set(
    book.passages.map((p) => p.chapterNo).filter((c): c is number => c != null),
  );
  const characters = book.passages.reduce((n, p) => n + p.text.length, 0);

  const insertBook = db.query(
    `INSERT INTO books(id, title, author, subject, source_format, page_count, chunk_count, char_count, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertChunk = db.query(
    `INSERT INTO chunks(book_id, chapter_no, chapter_title, section_title, page, ord, text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    insertBook.run(
      bookId,
      book.title,
      book.author,
      book.subject,
      sourceFormat,
      pages.size,
      book.passages.length,
      characters,
      JSON.stringify(meta),
      now(),
    );
    for (const p of book.passages) {
      insertChunk.run(bookId, p.chapterNo, p.chapterTitle, p.sectionTitle, p.page, p.ord, p.text);
    }
  });
  tx();

  return {
    bookId,
    title: book.title,
    chunks: book.passages.length,
    pages: pages.size,
    chapters: chapters.size,
    characters,
  };
}

export interface SqliteImportOptions {
  filePath: string;
  table: string;
  textColumn: string;
  titleColumn?: string;
  pageColumn?: string;
  chapterColumn?: string;
  chapterTitleColumn?: string;
  limit?: number;
}

/**
 * Import a book that already lives in a SQLite file. We open it read-only and
 * stream rows out of the chosen table into the local index.
 */
export function importSqliteBook(opts: SqliteImportOptions): ImportSummary {
  const src = new Database(opts.filePath, { readonly: true });
  try {
    const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
    const cols = [opts.textColumn, opts.titleColumn, opts.pageColumn, opts.chapterColumn, opts.chapterTitleColumn]
      .filter((c): c is string => !!c)
      .map(ident)
      .join(", ");
    const limit = Math.max(1, Math.min(opts.limit ?? 5_000_000, 5_000_000));
    const rows = src
      .query<Record<string, unknown>, []>(
        `SELECT ${cols} FROM ${ident(opts.table)} LIMIT ${limit}`,
      )
      .all();

    const passages: Passage[] = [];
    let ord = 0;
    for (const row of rows) {
      const text = String(row[opts.textColumn] ?? "").trim();
      if (!text) continue;
      const chapterNo = opts.chapterColumn ? Number(row[opts.chapterColumn]) || null : null;
      const chapterTitle = opts.chapterTitleColumn
        ? String(row[opts.chapterTitleColumn] ?? "") || null
        : null;
      const page = opts.pageColumn ? Number(row[opts.pageColumn]) || null : null;
      for (const chunk of chunkText(text)) {
        passages.push({ chapterNo, chapterTitle, sectionTitle: null, page, ord: ord++, text: chunk });
      }
    }

    const title =
      opts.titleColumn && rows.length ? String(rows[0][opts.titleColumn] ?? "") : "";
    const normalized: NormalizedBook = {
      title: title || `${opts.table} (${opts.filePath.split("/").pop()})`,
      author: null,
      subject: null,
      passages,
    };
    return persistBook(normalized, "sqlite", { table: opts.table, filePath: opts.filePath });
  } finally {
    src.close();
  }
}

/* -------------------------------------------------------------- library ---- */

export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  subject: string | null;
  source_format: string;
  page_count: number;
  chunk_count: number;
  char_count: number;
  created_at: number;
}

export function listBooks(): BookRow[] {
  return db
    .query<BookRow, []>(
      `SELECT id, title, author, subject, source_format, page_count, chunk_count, char_count, created_at
       FROM books ORDER BY created_at DESC`,
    )
    .all();
}

export function getBook(id: string): BookRow | null {
  return (
    db
      .query<BookRow, [string]>(
        `SELECT id, title, author, subject, source_format, page_count, chunk_count, char_count, created_at
         FROM books WHERE id = ?`,
      )
      .get(id) ?? null
  );
}

export function deleteBook(id: string): void {
  db.query("DELETE FROM books WHERE id = ?").run(id);
}

export interface OutlineNode {
  chapterNo: number | null;
  chapterTitle: string | null;
  sections: { sectionTitle: string | null; chunks: number }[];
  chunks: number;
}

export function bookOutline(bookId: string): OutlineNode[] {
  const rows = db
    .query<
      { chapter_no: number | null; chapter_title: string | null; section_title: string | null; n: number },
      [string]
    >(
      `SELECT chapter_no, chapter_title, section_title, COUNT(*) AS n
       FROM chunks WHERE book_id = ?
       GROUP BY chapter_no, chapter_title, section_title
       ORDER BY COALESCE(chapter_no, 0), MIN(ord)`,
    )
    .all(bookId);

  const out: OutlineNode[] = [];
  for (const row of rows) {
    let node = out.find((n) => n.chapterNo === row.chapter_no);
    if (!node) {
      node = { chapterNo: row.chapter_no, chapterTitle: row.chapter_title, sections: [], chunks: 0 };
      out.push(node);
    }
    node.chunks += row.n;
    node.sections.push({ sectionTitle: row.section_title, chunks: row.n });
  }
  return out;
}

/* --------------------------------------------------------------- search ---- */

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","for","of","to","in","on","at","by","with",
  "is","are","was","were","be","been","being","do","does","did","this","that","these","those",
  "i","you","he","she","it","we","they","me","him","her","us","them","my","your","its","our",
  "as","from","so","not","no","yes","can","could","should","would","will","shall","may","might",
  "must","have","has","had","how","what","when","where","which","who","why","about","into","over",
  "than","too","very","just","also","use","used","using","please","make","made","want","need",
]);

export function terms(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z0-9][a-z0-9+#._-]*/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const t = w.replace(/^[._-]+|[._-]+$/g, "");
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 24) break;
  }
  return out;
}

export function buildMatchQuery(query: string): string {
  const ts = terms(query).map((t) => `"${t}"*`);
  return ts.length ? ts.join(" OR ") : "";
}

export interface SearchHit {
  chunkId: number;
  bookId: string;
  bookTitle: string;
  chapterNo: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  page: number | null;
  text: string;
  snippet: string;
  score: number;
}

export interface SearchOptions {
  bookIds?: string[];
  limit?: number;
}

export function search(query: string, opts: SearchOptions = {}): SearchHit[] {
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 100);
  const match = buildMatchQuery(query);
  const bookFilter = opts.bookIds?.length
    ? `AND c.book_id IN (${opts.bookIds.map(() => "?").join(",")})`
    : "";
  const params = opts.bookIds?.length ? [...opts.bookIds] : [];

  if (match) {
    const hits = db
      .query<
        {
          chunkId: number; bookId: string; bookTitle: string; chapterNo: number | null;
          chapterTitle: string | null; sectionTitle: string | null; page: number | null;
          text: string; snippet: string; score: number;
        },
        (string | number)[]
      >(
        `SELECT c.id AS chunkId, c.book_id AS bookId, b.title AS bookTitle,
                c.chapter_no AS chapterNo, c.chapter_title AS chapterTitle,
                c.section_title AS sectionTitle, c.page AS page, c.text AS text,
                snippet(chunks_fts, 0, '<<', '>>', ' … ', 14) AS snippet,
                bm25(chunks_fts) AS score
         FROM chunks_fts
         JOIN chunks c ON c.id = chunks_fts.rowid
         JOIN books b ON b.id = c.book_id
         WHERE chunks_fts MATCH ? ${bookFilter}
         ORDER BY score
         LIMIT ${limit}`,
      )
      .all(match, ...params);
    if (hits.length) return hits;
  }

  // Fallback: literal substring scan (the "grep" path) so a rare exact term
  // still returns something even if it is not in the token index.
  const literal = query.trim();
  if (!literal) return [];
  return db
    .query<
      {
        chunkId: number; bookId: string; bookTitle: string; chapterNo: number | null;
        chapterTitle: string | null; sectionTitle: string | null; page: number | null;
        text: string; score: number;
      },
      (string | number)[]
    >(
      `SELECT c.id AS chunkId, c.book_id AS bookId, b.title AS bookTitle,
              c.chapter_no AS chapterNo, c.chapter_title AS chapterTitle,
              c.section_title AS sectionTitle, c.page AS page, c.text AS text, 0 AS score
       FROM chunks c JOIN books b ON b.id = c.book_id
       WHERE c.text LIKE ? ESCAPE '\\' ${bookFilter}
       ORDER BY c.book_id, c.ord LIMIT ${limit}`,
    )
    .all(`%${literal.replace(/[%_\\]/g, "\\$&")}%`, ...params)
    .map((h) => ({ ...h, snippet: h.text.slice(0, 280) }));
}

/**
 * Coverage sample: the opening passage of each chapter. Used when a broad
 * request shares no keywords with the index, so generation still has real
 * grounding instead of failing.
 */
export function coverageHits(bookIds: string[], limit: number): SearchHit[] {
  const inList = bookIds.length ? bookIds.map(() => "?").join(",") : null;
  const subFilter = inList ? `AND book_id IN (${inList})` : "";
  return db
    .query<
      {
        chunkId: number; bookId: string; bookTitle: string; chapterNo: number | null;
        chapterTitle: string | null; sectionTitle: string | null; page: number | null;
        text: string; score: number;
      },
      (string | number)[]
    >(
      `SELECT c.id AS chunkId, c.book_id AS bookId, b.title AS bookTitle,
              c.chapter_no AS chapterNo, c.chapter_title AS chapterTitle,
              c.section_title AS sectionTitle, c.page AS page, c.text AS text, 0 AS score
       FROM chunks c JOIN books b ON b.id = c.book_id
       WHERE c.id IN (SELECT MIN(id) FROM chunks WHERE 1=1 ${subFilter} GROUP BY book_id, chapter_no)
       ORDER BY c.book_id, c.ord LIMIT ${Math.max(1, limit)}`,
    )
    .all(...bookIds)
    .map((h) => ({ ...h, snippet: h.text.replace(/\s+/g, " ").slice(0, 280) }));
}

/* ------------------------------------------------------- book profiles ----- */

export interface BookProfile {
  summary: string;
  structure: { chapterNo: number | null; title: string | null; gist: string }[];
  style: string;
  concepts: string[];
  generatedAt: number;
  model: string | null;
}

export function saveBookProfile(bookId: string, profile: BookProfile): void {
  db.query(
    `INSERT INTO book_profiles(book_id, profile, created_at) VALUES (?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET profile = excluded.profile, created_at = excluded.created_at`,
  ).run(bookId, JSON.stringify(profile), now());
}

/* -------------------------------------------------------------- export ----- */

export interface ExportedPage {
  page: number | null;
  text: string;
}

export interface ExportedSection {
  title: string;
  pages: ExportedPage[];
}

export interface ExportedChapter {
  number: number;
  title: string;
  sections: ExportedSection[];
}

export interface ExportedBook {
  title: string;
  author: string | null;
  subject: string | null;
  exportedFrom: string;
  exportedAt: number;
  chapters?: ExportedChapter[];
  sections?: ExportedSection[];
}

/**
 * Rebuild a book from the index into the canonical JSON import shape, so a
 * downloaded book can be uploaded straight back into the Library dialog. This
 * is what the Download button on a book uses.
 */
export function exportBook(bookId: string): ExportedBook {
  const book = getBook(bookId);
  if (!book) throw new Error("Book not found");

  const rows = db
    .query<
      {
        chapter_no: number | null;
        chapter_title: string | null;
        section_title: string | null;
        page: number | null;
        text: string;
      },
      [string]
    >(
      `SELECT chapter_no, chapter_title, section_title, page, text
       FROM chunks WHERE book_id = ? ORDER BY ord`,
    )
    .all(bookId);

  const out: ExportedBook = {
    title: book.title,
    author: book.author,
    subject: book.subject,
    exportedFrom: `cortex-book/${book.id}`,
    exportedAt: now(),
  };

  if (rows.some((r) => r.chapter_no != null)) {
    const chapters: ExportedChapter[] = [];
    for (const row of rows) {
      const number = row.chapter_no ?? 0;
      let chapter = chapters.find((c) => c.number === number);
      if (!chapter) {
        chapter = {
          number,
          title: row.chapter_title ?? `Chapter ${number}`,
          sections: [],
        };
        chapters.push(chapter);
      }
      const sectionTitle = row.section_title ?? "";
      let section = chapter.sections.find((s) => s.title === sectionTitle);
      if (!section) {
        section = { title: sectionTitle, pages: [] };
        chapter.sections.push(section);
      }
      section.pages.push({ page: row.page, text: row.text });
    }
    out.chapters = chapters;
  } else {
    const sections: ExportedSection[] = [];
    for (const row of rows) {
      const title = row.section_title ?? "";
      let section = sections.find((s) => s.title === title);
      if (!section) {
        section = { title, pages: [] };
        sections.push(section);
      }
      section.pages.push({ page: row.page, text: row.text });
    }
    out.sections = sections;
  }

  return out;
}

/** A filesystem-safe filename for a downloaded book. */
export function bookFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "book"}.json`;
}

export function getBookProfile(bookId: string): BookProfile | null {
  const row = db
    .query<{ profile: string }, [string]>("SELECT profile FROM book_profiles WHERE book_id = ?")
    .get(bookId);
  if (!row) return null;
  try {
    return JSON.parse(row.profile) as BookProfile;
  } catch {
    return null;
  }
}
