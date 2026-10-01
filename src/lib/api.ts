/* Typed client for the local Bun + SQLite engine (same origin, via /api proxy). */

export interface Book {
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

export interface OutlineNode {
  chapterNo: number | null;
  chapterTitle: string | null;
  sections: { sectionTitle: string | null; chunks: number }[];
  chunks: number;
}

export interface BookProfile {
  summary: string;
  structure: { chapterNo: number | null; title: string | null; gist: string }[];
  style: string;
  concepts: string[];
  generatedAt: number;
  model: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export interface Memory {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  content: string;
  pinned: number;
  created_at: number;
}

export interface Generation {
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

export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  contextChunks: number;
}

export interface PlannerConfig {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface LibraryStats {
  books: number;
  chunks: number;
  chapters: number;
  projects: number;
  memories: number;
  generations: number;
}

export interface ModelStatus {
  ok: boolean;
  baseUrl: string;
  model: string;
  models: string[];
  error?: string;
}

export interface ImportSummary {
  bookId: string;
  title: string;
  chunks: number;
  pages: number;
  chapters: number;
  characters: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

const body = (value: unknown) => JSON.stringify(value);

export const api = {
  health: () => request<{ ok: boolean; stats: LibraryStats; model: ModelConfig }>("/api/health"),

  settings: () => request<{ model: ModelConfig; planner: PlannerConfig }>("/api/settings"),
  updateSettings: (patch: Partial<{ model: Partial<ModelConfig>; planner: Partial<PlannerConfig> }>) =>
    request<{ model: ModelConfig; planner: PlannerConfig }>("/api/settings", {
      method: "PUT",
      body: body(patch),
    }),
  testModel: () => request<ModelStatus>("/api/model/test", { method: "POST" }),
  listModels: () => request<{ models: string[] }>("/api/model/models"),

  books: () => request<{ books: Book[] }>("/api/books"),
  importBook: (book: unknown) =>
    request<ImportSummary>("/api/books/import", { method: "POST", body: body(book) }),
  importSqlite: (options: Record<string, string>) =>
    request<ImportSummary>("/api/books/import-sqlite", { method: "POST", body: body(options) }),
  deleteBook: (id: string) => request<{ ok: true }>(`/api/books/${id}`, { method: "DELETE" }),
  outline: (id: string) => request<{ outline: OutlineNode[] }>(`/api/books/${id}/outline`),
  profile: (id: string) => request<{ profile: BookProfile | null }>(`/api/books/${id}/profile`),
  buildProfile: (id: string) =>
    request<{ profile: BookProfile }>(`/api/books/${id}/profile`, { method: "POST" }),

  search: (q: string, books: string[] = [], limit = 20) =>
    request<{ hits: SearchHit[] }>(
      `/api/search?q=${encodeURIComponent(q)}&limit=${limit}${books.length ? `&books=${books.join(",")}` : ""}`,
    ),

  projects: () => request<{ projects: Project[] }>("/api/projects"),
  createProject: (name: string, description = "") =>
    request<{ project: Project }>("/api/projects", { method: "POST", body: body({ name, description }) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),

  memories: (projectId: string) =>
    request<{ memories: Memory[] }>(`/api/projects/${projectId}/memories`),
  addMemory: (projectId: string, input: { title: string; content: string; kind?: string; pinned?: boolean }) =>
    request<{ memory: Memory }>(`/api/projects/${projectId}/memories`, {
      method: "POST",
      body: body(input),
    }),
  updateMemory: (id: string, patch: Partial<Omit<Memory, "pinned">> & { pinned?: boolean }) =>
    request<{ ok: true }>(`/api/memories/${id}`, { method: "PATCH", body: body(patch) }),
  deleteMemory: (id: string) => request<{ ok: true }>(`/api/memories/${id}`, { method: "DELETE" }),

  generations: (projectId?: string | null) =>
    request<{ generations: Generation[] }>(
      `/api/generations${projectId ? `?projectId=${projectId}` : ""}`,
    ),
  deleteGeneration: (id: string) => request<{ ok: true }>(`/api/generations/${id}`, { method: "DELETE" }),
};

/* ------------------------------------------------------------ generation ---- */

export type GenEvent =
  | { type: "status"; stage: string; detail?: string }
  | { type: "plan"; mode: "single" | "sectioned"; title?: string; sections: { title: string; brief: string }[] }
  | { type: "sources"; sources: SourceRef[] }
  | { type: "section-start"; index: number; total: number; title: string }
  | { type: "token"; text: string }
  | {
      type: "done";
      generationId: string;
      mode: "single" | "sectioned";
      grounding: { paragraphs: number; cited: number; invalid: number };
    }
  | { type: "error"; message: string };

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

export interface GenerateRequest {
  request: string;
  bookIds: string[];
  projectId?: string | null;
  mode?: "auto" | "single" | "sectioned";
  maxSections?: number;
  temperature?: number;
}

/** POST /api/generate and invoke `onEvent` for each server-sent event. */
export async function streamGenerate(
  req: GenerateRequest,
  onEvent: (event: GenEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Generation failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        onEvent(JSON.parse(payload) as GenEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
