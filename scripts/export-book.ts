import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBundledBook } from "../server/bookSource.ts";

/**
 * Merge a bundled book's part files into ONE importable JSON file and write it
 * to `public/`, so it is served as a static download (and included in `dist/`
 * by `vite build`).
 *
 *   bun run book              # the JavaScript reference
 *   bun run book javascript    # any directory under books/
 */

const SOURCE = process.argv[2] ?? "javascript";
const bundle = loadBundledBook(SOURCE);

const fileName = bundle.title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60);

const outDir = resolve(process.cwd(), "public");
mkdirSync(outDir, { recursive: true });

const outFile = resolve(outDir, `${fileName}.json`);
writeFileSync(outFile, `${JSON.stringify(bundle.book, null, 2)}\n`);

const bytes = JSON.stringify(bundle.book).length;
console.log(`${bundle.title}`);
console.log(
  `  ${bundle.chapters} chapters · ${bundle.pages} pages · ${bundle.words.toLocaleString()} words · ${(bytes / 1024).toFixed(0)} KB`,
);
console.log(`  written  public/${fileName}.json`);
console.log(`  served   /${fileName}.json`);
