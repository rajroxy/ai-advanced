import { db, newId, now } from "./db.ts";
import { buildMatchQuery } from "./books.ts";
import type { CaseMemory } from "./prompts.ts";

/** Long-lived project memory, so the AI remembers a build across sessions. */

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export interface MemoryRow {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  content: string;
  pinned: number;
  created_at: number;
}

export function listProjects(): ProjectRow[] {
  return db
    .query<ProjectRow, []>("SELECT * FROM projects ORDER BY updated_at DESC")
    .all();
}

export function getProject(id: string): ProjectRow | null {
  return db.query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?").get(id) ?? null;
}

export function createProject(name: string, description = ""): ProjectRow {
  const id = newId();
  const ts = now();
  db.query(
    "INSERT INTO projects(id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, name.trim() || "Untitled project", description.trim(), ts, ts);
  return { id, name: name.trim() || "Untitled project", description, created_at: ts, updated_at: ts };
}

export function renameProject(id: string, name: string, description?: string): void {
  db.query("UPDATE projects SET name = ?, description = COALESCE(?, description), updated_at = ? WHERE id = ?").run(
    name.trim() || "Untitled project",
    description ?? null,
    now(),
    id,
  );
}

export function deleteProject(id: string): void {
  db.query("DELETE FROM projects WHERE id = ?").run(id);
}

export function listMemories(projectId: string): MemoryRow[] {
  return db
    .query<MemoryRow, [string]>(
      "SELECT * FROM memories WHERE project_id = ? ORDER BY pinned DESC, created_at DESC",
    )
    .all(projectId);
}

export function addMemory(input: {
  projectId: string;
  title: string;
  content: string;
  kind?: string;
  pinned?: boolean;
}): MemoryRow {
  const row: MemoryRow = {
    id: newId(),
    project_id: input.projectId,
    kind: input.kind ?? "fact",
    title: input.title.trim(),
    content: input.content.trim(),
    pinned: input.pinned ? 1 : 0,
    created_at: now(),
  };
  db.query(
    "INSERT INTO memories(id, project_id, kind, title, content, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(row.id, row.project_id, row.kind, row.title, row.content, row.pinned, row.created_at);
  db.query("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), input.projectId);
  return row;
}

export function updateMemory(
  id: string,
  patch: { title?: string; content?: string; kind?: string; pinned?: boolean },
): void {
  const existing = db.query<MemoryRow, [string]>("SELECT * FROM memories WHERE id = ?").get(id);
  if (!existing) return;
  db.query(
    "UPDATE memories SET title = ?, content = ?, kind = ?, pinned = ? WHERE id = ?",
  ).run(
    patch.title ?? existing.title,
    patch.content ?? existing.content,
    patch.kind ?? existing.kind,
    (patch.pinned ?? !!existing.pinned) ? 1 : 0,
    id,
  );
}

export function deleteMemory(id: string): void {
  db.query("DELETE FROM memories WHERE id = ?").run(id);
}

/** Pinned + relevant memories to inject into a generation prompt. */
export function memoryContext(projectId: string | null | undefined, request: string): CaseMemory[] {
  if (!projectId) return [];
  const pinned = db
    .query<MemoryRow, [string]>(
      "SELECT * FROM memories WHERE project_id = ? AND pinned = 1 ORDER BY created_at DESC LIMIT 8",
    )
    .all(projectId);

  const match = buildMatchQuery(request);
  const relevant = match
    ? db
        .query<MemoryRow, [string, string]>(
          `SELECT m.* FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
           WHERE memories_fts MATCH ? AND m.project_id = ? AND m.pinned = 0
           ORDER BY bm25(memories_fts) LIMIT 6`,
        )
        .all(match, projectId)
    : [];

  const recent = db
    .query<MemoryRow, [string]>(
      "SELECT * FROM memories WHERE project_id = ? AND pinned = 0 ORDER BY created_at DESC LIMIT 4",
    )
    .all(projectId);

  const seen = new Set<string>();
  const out: CaseMemory[] = [];
  for (const row of [...pinned, ...relevant, ...recent]) {
    if (seen.has(row.id) || out.length >= 12) continue;
    seen.add(row.id);
    out.push({ kind: row.kind, title: row.title, content: row.content, pinned: !!row.pinned });
  }
  return out;
}
