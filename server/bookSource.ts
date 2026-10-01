import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RawBook, RawChapter } from "./books.ts";

/**
 * The bundled books live on disk as several small part files (easier to write
 * and review than one huge blob). This module merges them into ONE canonical
 * book object that is both:
 *
 *   1. what `bun run seed` indexes, and
 *   2. what `GET /api/books/bundled/:source` downloads.
 *
 * Because both paths use the same shape, a downloaded file can be re-imported
 * through the Library dialog and round-trips exactly.
 */

const BOOKS_DIR = resolve(process.cwd(), "books");
/**
 * Extra code sections, keyed by chapter title, live in their own directory so
 * they can be authored and reviewed separately from the running prose. Each
 * file is { "<chapter title>": ["page text", ...] }. The section is inserted
 * into the chapter it names, so the code sits between the existing sections
 * rather than being bolted on at the end of the book.
 */
const CODE_DIR = resolve(BOOKS_DIR, "code");

function loadCodeSections(): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  if (!existsSync(CODE_DIR)) return sections;
  for (const file of readdirSync(CODE_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = JSON.parse(readFileSync(resolve(CODE_DIR, file), "utf8")) as Record<string, string[]>;
    for (const [title, pages] of Object.entries(parsed)) {
      if (!Array.isArray(pages) || !pages.length) continue;
      sections.set(title, pages);
    }
  }
  return sections;
}

/** Compact on-disk format: { part, chapters: [{ c, s: [{ t, p: [page] }] }] }. */
interface PartSection {
  t: string;
  p: string[];
}
interface PartChapter {
  c: string;
  s: PartSection[];
}
interface PartFile {
  part: string;
  chapters: PartChapter[];
}

export interface BundledPart {
  file: string;
  part: string;
  chapters: number;
  pages: number;
}

/**
 * The part files store one entry per paragraph, which is the natural unit to
 * write but not the natural unit to print. A real textbook page holds several
 * paragraphs, so consecutive paragraphs are packed into pages of roughly this
 * many characters — enough to fill a page at typical prose density.
 */
/** ~650 words at typical prose density: a full book page. */
const TARGET_PAGE_CHARS = 4200;
/** Hard ceiling, so rounding never leaves one chapter on a 1,200-word slab. */
const MAX_PAGE_CHARS = 5200;

/**
 * Pack a chapter's paragraphs into page-sized blocks.
 *
 * Page breaks do not respect subsection boundaries in a real book, so we pack
 * across the whole chapter. Each resulting page is attributed to the section it
 * starts in; when a page runs on into the next section, that section's heading
 * is kept inline as its own paragraph, so no heading is ever lost.
 *
 * Returns only the sections that actually own at least one page.
 */
export function packChapterPages(sections: PartSection[]): { title: string; pages: string[] }[] {
  const flat: { text: string; section: string }[] = [];
  for (const section of sections) {
    for (const text of section.p ?? []) flat.push({ text, section: section.t });
  }

  const out: { title: string; pages: string[] }[] = [];

  // Decide up front how many pages this chapter gets, then spread the text
  // evenly across them. Without this, a chapter just over one page long ends on
  // a two-line widow while the next ends on a 1,000-word slab.
  const total = flat.reduce((n, p) => n + p.text.length + 2, 0);
  let pageCount = Math.max(1, Math.round(total / TARGET_PAGE_CHARS));
  while (total / pageCount > MAX_PAGE_CHARS) pageCount++;
  const perPage = total / pageCount;

  let buffer: string[] = [];
  let owner: string | null = null;
  // The section of the paragraph most recently added, tracked separately from
  // `owner` (the section the page started in). Without this, a page that runs
  // across a boundary re-emits the new section's heading for every paragraph.
  let current: string | null = null;
  let size = 0;
  let flushed = 0;

  const flush = () => {
    if (!buffer.length || owner === null) return;
    let target = out.find((section) => section.title === owner);
    if (!target) {
      target = { title: owner, pages: [] };
      out.push(target);
    }
    target.pages.push(buffer.join("\n\n"));
    buffer = [];
    size = 0;
    flushed++;
  };

  for (const paragraph of flat) {
    // Break when this paragraph would overrun the current page's share of the
    // chapter, as long as a page of the budget is still available.
    const projected = size + paragraph.text.length + 2;
    if (buffer.length && projected > perPage * (flushed + 1) && flushed + 1 < pageCount) {
      flush();
    }

    if (!buffer.length) {
      owner = paragraph.section;
      current = paragraph.section;
    } else if (paragraph.section !== current) {
      // The page ran on into a new subsection: keep its heading inline, once,
      // as a markdown heading so it is visibly a heading rather than body text.
      const heading = `### ${paragraph.section}`;
      buffer.push(heading);
      size += heading.length + 2;
      current = paragraph.section;
    }
    buffer.push(paragraph.text);
    size += paragraph.text.length + 2;
  }
  flush();
  return out;
}

export interface BundledBook {
  source: string;
  title: string;
  author: string;
  subject: string;
  language: string;
  book: RawBook;
  parts: BundledPart[];
  chapters: number;
  pages: number;
  characters: number;
  words: number;
  /** How many chapters received an interleaved code section. */
  codeSections: number;
}

/** Metadata for one bundled book, without building its full chapter tree. */
export interface BundleInfo {
  source: string;
  title: string;
  author: string;
  subject: string;
  chapters: number;
  pages: number;
  characters: number;
  words: number;
  codeSections: number;
}

interface BundleManifest {
  title: string;
  author: string;
  subject: string;
  language: string;
}

const MANIFESTS: Record<string, BundleManifest> = {
  javascript: {
    title: "JavaScript: The Complete Local Reference",
    author: "Cortex Book",
    subject: "JavaScript",
    language: "en",
  },
};

/** Directory names under `books/` that hold a bundled book. */
export function listBundleSources(): string[] {
  if (!existsSync(BOOKS_DIR)) return [];
  return readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(resolve(BOOKS_DIR, name)))
    .sort();
}

function manifestFor(source: string): BundleManifest {
  return (
    MANIFESTS[source] ?? {
      title: source,
      author: "Cortex Book",
      subject: source,
      language: "en",
    }
  );
}

function partFiles(source: string): string[] {
  const dir = resolve(BOOKS_DIR, source);
  if (!existsSync(dir)) throw new Error(`No bundled book named "${source}".`);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

/**
 * Merge every part file of a bundled book into a canonical book object.
 * Page numbers are assigned sequentially across the whole book so citations
 * read "p.37" the same way they would in print.
 */
export function loadBundledBook(source: string): BundledBook {
  const files = partFiles(source);
  if (!files.length) throw new Error(`The bundled "${source}" book has no parts.`);
  const dir = resolve(BOOKS_DIR, source);

  const codeSections = loadCodeSections();
  const chapters: RawChapter[] = [];
  const parts: BundledPart[] = [];
  let page = 1;
  let characters = 0;
  let codeAdded = 0;

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as PartFile;
    let partPages = 0;
    for (const chapter of parsed.chapters ?? []) {
      // Splice this chapter's code section in after its first prose section, so
      // the examples sit between the existing writing.
      const source = [...(chapter.s ?? [])];
      const code = codeSections.get(chapter.c);
      if (code) {
        source.splice(Math.min(1, source.length), 0, { t: "Code", p: code });
        codeAdded++;
      }

      // Number real pages: several paragraphs per page, as in print.
      const sections = packChapterPages(source).map((section) => ({
        title: section.title,
        pages: section.pages.map((text) => {
          characters += text.length;
          partPages++;
          return { page: page++, text };
        }),
      }));
      chapters.push({ number: chapters.length + 1, title: chapter.c, sections });
    }
    parts.push({
      file,
      part: parsed.part,
      chapters: (parsed.chapters ?? []).length,
      pages: partPages,
    });
  }

  const meta = manifestFor(source);
  const book: RawBook = {
    title: meta.title,
    author: meta.author,
    subject: meta.subject,
    language: meta.language,
    chapters,
  };

  return {
    source,
    ...meta,
    book,
    parts,
    chapters: chapters.length,
    pages: page - 1,
    characters,
    words: countWords(book),
    codeSections: codeAdded,
  };
}

/** Rough word count of a book's page text, for honest size reporting. */
export function countWords(book: RawBook): number {
  let words = 0;
  for (const chapter of book.chapters ?? []) {
    for (const section of chapter.sections ?? []) {
      for (const p of section.pages ?? []) {
        const text = typeof p === "string" ? p : p.text ?? "";
        const matches = text.match(/[A-Za-z0-9'’-]+/g);
        if (matches) words += matches.length;
      }
    }
  }
  return words;
}

/** Light metadata for every bundled book, for the download picker. */
export function listBundles(): BundleInfo[] {
  return listBundleSources().map((source) => {
    try {
      const loaded = loadBundledBook(source);
      return {
        source,
        title: loaded.title,
        author: loaded.author,
        subject: loaded.subject,
        chapters: loaded.chapters,
        pages: loaded.pages,
        characters: loaded.characters,
        words: loaded.words,
        codeSections: loaded.codeSections,
      };
    } catch {
      const meta = manifestFor(source);
      return { source, ...meta, chapters: 0, pages: 0, characters: 0, words: 0, codeSections: 0 };
    }
  });
}
