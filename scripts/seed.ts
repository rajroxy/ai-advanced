import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deleteBook, importBook, listBooks, type RawChapter } from "../server/books.ts";

/**
 * Build the bundled JavaScript book from its part files and index it locally.
 * Re-running replaces the previous copy of the same title, so it is safe.
 */

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

const TITLE = "JavaScript: The Complete Local Reference";
const SOURCE_DIR = resolve(process.cwd(), "books", "javascript");

const files = readdirSync(SOURCE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

if (!files.length) {
  console.error(`No book parts found in ${SOURCE_DIR}`);
  process.exit(1);
}

let page = 1;
const chapters: RawChapter[] = [];

for (const file of files) {
  const parsed = JSON.parse(readFileSync(resolve(SOURCE_DIR, file), "utf8")) as PartFile;
  for (const chapter of parsed.chapters) {
    chapters.push({
      title: chapter.c,
      sections: chapter.s.map((section) => ({
        title: section.t,
        pages: section.p.map((text) => ({ page: page++, text })),
      })),
    });
  }
  console.log(`  + ${parsed.part} (${parsed.chapters.length} chapters, ${file})`);
}

// Replace an earlier copy with the same title so seeding is idempotent.
for (const existing of listBooks()) {
  if (existing.title === TITLE) {
    deleteBook(existing.id);
    console.log(`  ~ removed previous copy (${existing.id})`);
  }
}

const summary = importBook(
  {
    title: TITLE,
    author: "Cortex Book",
    subject: "JavaScript",
    language: "en",
    chapters,
  },
  "json",
);

console.log(
  `\nIndexed “${summary.title}”: ${summary.chapters} chapters, ${summary.chunks.toLocaleString()} passages, ${summary.pages.toLocaleString()} pages.`,
);
console.log(`Book id: ${summary.bookId}`);
