import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The whole system is local. Everything the AI "knows" about a book lives in
 * this SQLite file, never in the model weights. SQLite FTS5 gives us the
 * instant "grep/find" behaviour the user asked for: the engine searches an
 * inverted index instead of re-reading the book from page one.
 */

export const DB_PATH =
  process.env.CORTEX_DB ?? resolve(process.cwd(), "data", "cortex.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

// A failed open almost always means the file is damaged or locked by another
// process. Surface a clear message instead of crashing the whole workspace.
let database: Database;
try {
  database = new Database(DB_PATH, { create: true });
} catch (err) {
  throw new Error(
    `Could not open the local database at ${DB_PATH}. It may be locked by another running copy of the engine — close other instances and retry. (${err instanceof Error ? err.message : String(err)})`,
  );
}

export const db = database;

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT,
  subject       TEXT,
  source_format TEXT NOT NULL DEFAULT 'json',
  page_count    INTEGER NOT NULL DEFAULT 0,
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  char_count    INTEGER NOT NULL DEFAULT 0,
  meta          TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_no    INTEGER,
  chapter_title TEXT,
  section_title TEXT,
  page          INTEGER,
  ord           INTEGER NOT NULL,
  text          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(book_id, ord);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  content='chunks',
  content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TABLE IF NOT EXISTS book_profiles (
  book_id    TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  profile    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'fact',
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  title,
  content,
  content='memories',
  content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO memories_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TABLE IF NOT EXISTS generations (
  id         TEXT PRIMARY KEY,
  project_id TEXT,
  book_ids   TEXT NOT NULL DEFAULT '[]',
  prompt     TEXT NOT NULL,
  output     TEXT NOT NULL,
  model      TEXT,
  mode       TEXT NOT NULL DEFAULT 'single',
  used       TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generations_project ON generations(project_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Fail loudly (in logs) rather than silently: if the file is damaged we tell the
// user immediately, and the backup endpoints let them snapshot a healthy copy.
{
  const integrity = integrityCheck();
  if (!integrity.ok) {
    console.warn(`[cortex] database integrity check reported: ${integrity.message}`);
  }
}

/* ------------------------------------------------------------------ ids ---- */

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();

/* ------------------------------------------------------------- settings ---- */

export function getSetting(key: string): string | null {
  const row = db
    .query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?")
    .get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.query(
    "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function getJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ---------------------------------------------------------------- stats ---- */

export interface LibraryStats {
  books: number;
  chunks: number;
  chapters: number;
  projects: number;
  memories: number;
  generations: number;
}

/* ------------------------------------------------------------ integrity ---- */

/** Flush the write-ahead log so the main .db file is self-contained. */
export function checkpoint(): void {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    /* not fatal */
  }
}

export interface DbStatus {
  path: string;
  bytes: number;
  ok: boolean;
  message: string;
  lastBackup: string | null;
}

export function integrityCheck(): { ok: boolean; message: string } {
  try {
    const row = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check;").get();
    const message = row?.integrity_check ?? "unknown";
    return { ok: message === "ok", message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

const BACKUP_DIR = () => join(dirname(DB_PATH), "backups");

/** Copy the database to a timestamped file without stopping the engine. */
export function backupDb(): string {
  checkpoint();
  const dir = BACKUP_DIR();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(dir, `cortex-${stamp}.db`);
  copyFileSync(DB_PATH, dest);
  return dest;
}

function lastBackup(): string | null {
  try {
    const dir = BACKUP_DIR();
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((f) => f.endsWith(".db")).sort();
    return files.length ? join(dir, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

export function dbStatus(): DbStatus {
  const integrity = integrityCheck();
  let bytes = 0;
  try {
    bytes = statSync(DB_PATH).size;
  } catch {
    bytes = 0;
  }
  return { path: DB_PATH, bytes, ok: integrity.ok, message: integrity.message, lastBackup: lastBackup() };
}

export function stats(): LibraryStats {
  const one = (sql: string): number => db.query<{ n: number }, []>(sql).get()?.n ?? 0;
  return {
    books: one("SELECT COUNT(*) AS n FROM books"),
    chunks: one("SELECT COUNT(*) AS n FROM chunks"),
    chapters: one("SELECT COUNT(DISTINCT book_id || ':' || chapter_no) AS n FROM chunks"),
    projects: one("SELECT COUNT(*) AS n FROM projects"),
    memories: one("SELECT COUNT(*) AS n FROM memories"),
    generations: one("SELECT COUNT(*) AS n FROM generations"),
  };
}
