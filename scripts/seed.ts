import { deleteBook, importBook, listBooks } from "../server/books.ts";
import { loadBundledBook } from "../server/bookSource.ts";

/**
 * Index the bundled JavaScript book into the local database.
 * The book itself is plain data on disk (`books/javascript/*.json`); this
 * script merges the parts and indexes them. Re-running replaces the previous
 * copy of the same title, so it is safe and idempotent.
 */

const SOURCE = process.argv[2] ?? "javascript";

const bundle = loadBundledBook(SOURCE);
for (const part of bundle.parts) {
  console.log(`  + ${part.part} (${part.chapters} chapters, ${part.file})`);
}

// Replace an earlier copy with the same title so seeding is idempotent.
for (const existing of listBooks()) {
  if (existing.title === bundle.title) {
    deleteBook(existing.id);
    console.log(`  ~ removed previous copy (${existing.id})`);
  }
}

const summary = importBook(bundle.book, "json");

console.log(
  `\nIndexed “${summary.title}”: ${summary.chapters} chapters, ${summary.pages.toLocaleString()} pages, ${bundle.words.toLocaleString()} words.`,
);
console.log(`  ${summary.chunks.toLocaleString()} passages in the local search index.`);
console.log(`Book id: ${summary.bookId}`);
