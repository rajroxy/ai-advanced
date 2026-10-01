import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
  bookFileName,
  bookOutline,
  deleteBook,
  exportBook,
  getBook,
  getBookProfile,
  importBook,
  importSqliteBook,
  listBooks,
  search,
  type RawBook,
} from "./books.ts";
import { listBundles, loadBundledBook } from "./bookSource.ts";
import { backupDb, dbStatus, stats } from "./db.ts";
import {
  getModelConfig,
  getPlannerConfig,
  listModels,
  setModelConfig,
  setPlannerConfig,
  testConnection,
  type ModelConfig,
  type PlannerConfig,
} from "./model.ts";
import {
  addMemory,
  createProject,
  deleteMemory,
  deleteProject,
  getProject,
  listMemories,
  listProjects,
  renameProject,
  updateMemory,
} from "./memory.ts";
import { deleteGeneration, listGenerations, runGeneration, type GenRequest } from "./generate.ts";
import { buildBookProfile } from "./profile.ts";

// Prefer the platform/OS-injected PORT so the exposed preview port is ours.
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
const HOST = process.env.API_HOST ?? "0.0.0.0";
const DIST = resolve(process.cwd(), "dist");

// In dev the UI is served by Vite, so any non-API request is proxied to it.
// That lets a single exposed port serve the whole app. In production
// (no CORTEX_DEV) the same server serves the built assets from dist/.
const DEV_PROXY = process.env.CORTEX_DEV
  ? `http://127.0.0.1:${process.env.VITE_PORT ?? "5173"}`
  : null;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (data: unknown, status = 200) =>
  Response.json(data as Record<string, unknown>, { status, headers: CORS });

const fail = (message: string, status = 400) => json({ error: message }, status);

/** A JSON payload offered as a file download. */
const download = (data: unknown, filename: string) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });

type Ctx = { params: Record<string, string>; req: Request; url: URL };
type Handler = (ctx: Ctx) => Response | Promise<Response>;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path
        .split("/")
        .map((seg) => {
          if (seg.startsWith(":")) {
            keys.push(seg.slice(1));
            return "([^/]+)";
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("/") +
      "$",
  );
  routes.push({ method, pattern, keys, handler });
}

/* --------------------------------------------------------------- system ---- */

route("GET", "/api/health", () =>
  json({ ok: true, stats: stats(), model: getModelConfig(), planner: getPlannerConfig() }),
);

route("GET", "/api/db/status", () => json(dbStatus()));

route("POST", "/api/db/backup", () => {
  try {
    return json({ ok: true, path: backupDb() });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
});

route("GET", "/api/settings", () => json({ model: getModelConfig(), planner: getPlannerConfig() }));

route("PUT", "/api/settings", async ({ req }) => {
  const body = (await req.json()) as { model?: Partial<ModelConfig>; planner?: Partial<PlannerConfig> };
  if (body.model) setModelConfig(body.model);
  if (body.planner) setPlannerConfig(body.planner);
  return json({ model: getModelConfig(), planner: getPlannerConfig() });
});

route("POST", "/api/model/test", async () => json(await testConnection()));

route("GET", "/api/model/models", async () => {
  try {
    return json({ models: await listModels() });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 502);
  }
});

/* ---------------------------------------------------------------- books ---- */

route("GET", "/api/books", () => json({ books: listBooks() }));

route("POST", "/api/books/import", async ({ req }) => {
  const body = (await req.json()) as { book?: RawBook; sourceFormat?: string } & RawBook;
  const book = (body.book ?? body) as RawBook;
  const sourceFormat = body.sourceFormat ?? "json";
  try {
    return json(importBook(book, sourceFormat));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
});

route("POST", "/api/books/import-sqlite", async ({ req }) => {
  const body = (await req.json()) as { filePath?: string; table?: string; textColumn?: string };
  if (!body.filePath || !body.table || !body.textColumn) {
    return fail("filePath, table and textColumn are required");
  }
  try {
    return json(
      importSqliteBook({
        filePath: body.filePath,
        table: body.table,
        textColumn: body.textColumn,
        titleColumn: (body as { titleColumn?: string }).titleColumn,
        pageColumn: (body as { pageColumn?: string }).pageColumn,
        chapterColumn: (body as { chapterColumn?: string }).chapterColumn,
        chapterTitleColumn: (body as { chapterTitleColumn?: string }).chapterTitleColumn,
      }),
    );
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
});

/* Bundled books: the book files that ship with the engine, offered as a single
 * downloadable JSON file that the Import dialog can read straight back. */
route("GET", "/api/books/bundles", () => json({ bundles: listBundles() }));

route("GET", "/api/books/bundled/:source", ({ params }) => {
  try {
    const bundle = loadBundledBook(params.source);
    return download(bundle.book, bookFileName(bundle.title));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 404);
  }
});

route("GET", "/api/books/:id/export", ({ params }) => {
  try {
    const book = exportBook(params.id);
    return download(book, bookFileName(book.title));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 404);
  }
});

route("GET", "/api/books/:id", ({ params }) => {
  const book = getBook(params.id);
  return book ? json({ book, profile: getBookProfile(book.id) }) : fail("Book not found", 404);
});

route("DELETE", "/api/books/:id", ({ params }) => {
  deleteBook(params.id);
  return json({ ok: true });
});

route("GET", "/api/books/:id/outline", ({ params }) => json({ outline: bookOutline(params.id) }));

route("GET", "/api/books/:id/profile", ({ params }) => {
  const book = getBook(params.id);
  if (!book) return fail("Book not found", 404);
  return json({ profile: getBookProfile(params.id) });
});

route("POST", "/api/books/:id/profile", async ({ params }) => {
  try {
    return json({ profile: await buildBookProfile(params.id) });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
});

route("GET", "/api/search", ({ url }) => {
  const q = url.searchParams.get("q") ?? "";
  const books = url.searchParams.get("books");
  const limit = Number(url.searchParams.get("limit") ?? 12);
  const bookIds = books ? books.split(",").filter(Boolean) : [];
  return json({ hits: search(q, { bookIds, limit }) });
});

/* ------------------------------------------------------------- projects ---- */

route("GET", "/api/projects", () => json({ projects: listProjects() }));

route("POST", "/api/projects", async ({ req }) => {
  const body = (await req.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) return fail("Project name is required");
  return json({ project: createProject(body.name, body.description ?? "") });
});

route("PATCH", "/api/projects/:id", async ({ params, req }) => {
  const body = (await req.json()) as { name?: string; description?: string };
  const existing = getProject(params.id);
  if (!existing) return fail("Project not found", 404);
  renameProject(params.id, body.name ?? existing.name, body.description);
  return json({ project: getProject(params.id) });
});

route("DELETE", "/api/projects/:id", ({ params }) => {
  deleteProject(params.id);
  return json({ ok: true });
});

route("GET", "/api/projects/:id/memories", ({ params }) => json({ memories: listMemories(params.id) }));

route("POST", "/api/projects/:id/memories", async ({ params, req }) => {
  const body = (await req.json()) as { title?: string; content?: string; kind?: string; pinned?: boolean };
  if (!body.title?.trim()) return fail("Memory title is required");
  return json({
    memory: addMemory({
      projectId: params.id,
      title: body.title,
      content: body.content ?? "",
      kind: body.kind,
      pinned: body.pinned,
    }),
  });
});

route("PATCH", "/api/memories/:id", async ({ params, req }) => {
  const body = (await req.json()) as { title?: string; content?: string; kind?: string; pinned?: boolean };
  updateMemory(params.id, body);
  return json({ ok: true });
});

route("DELETE", "/api/memories/:id", ({ params }) => {
  deleteMemory(params.id);
  return json({ ok: true });
});

/* ----------------------------------------------------------- generation ---- */

route("GET", "/api/generations", ({ url }) =>
  json({ generations: listGenerations(url.searchParams.get("projectId")) }),
);

route("DELETE", "/api/generations/:id", ({ params }) => {
  deleteGeneration(params.id);
  return json({ ok: true });
});

route("POST", "/api/generate", async ({ req }) => {
  const body = (await req.json()) as GenRequest;
  if (!body?.request?.trim()) return fail("A request is required");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runGeneration({
          request: body.request,
          bookIds: body.bookIds ?? [],
          projectId: body.projectId ?? null,
          mode: body.mode ?? "auto",
          maxSections: body.maxSections,
          temperature: body.temperature,
        })) {
          send(event);
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});

/* --------------------------------------------------------------- static ---- */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

async function proxyToVite(req: Request, url: URL): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete("host");
  try {
    return await fetch(`${DEV_PROXY}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      redirect: "manual",
    });
  } catch {
    return new Response("UI dev server is starting…", { status: 503 });
  }
}

function serveStatic(pathname: string): Response | null {
  if (!existsSync(DIST)) return null;
  const safe = pathname.replace(/\.\.+/g, "");
  let filePath = join(DIST, safe === "/" ? "index.html" : safe);
  if (!existsSync(filePath) || safe === "/") filePath = join(DIST, "index.html");
  if (!existsSync(filePath)) return null;
  return new Response(readFileSync(filePath), {
    headers: { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" },
  });
}

/* --------------------------------------------------------------- server ---- */

Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname.startsWith("/api/")) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const match = r.pattern.exec(url.pathname);
        if (!match) continue;
        const params: Record<string, string> = {};
        r.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1])));
        try {
          return await r.handler({ params, req, url });
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err), 500);
        }
      }
      return fail(`No route for ${req.method} ${url.pathname}`, 404);
    }

    if (DEV_PROXY) return proxyToVite(req, url);
    return serveStatic(url.pathname) ?? new Response("Not found", { status: 404 });
  },
});

console.log(`Cortex engine (local) listening on http://${HOST}:${PORT}`);
