/**
 * Offline smoke test. Spins up a stub OpenAI-compatible server, indexes a tiny
 * book into a throwaway database, and runs the real generation pipeline through
 * it. Verifies retrieval, streaming, section planning and the grounding audit
 * without installing a model or touching your real library.
 *
 *   bun run smoke
 */

process.env.CORTEX_DB = process.env.CORTEX_DB ?? "/tmp/cortex-smoke.db";

const PORT = 11435;
const CANNED =
  "## Answer\n\n" +
  "This paragraph is grounded in a retrieved passage [S1].\n\n" +
  "This paragraph cites a passage that was never retrieved [S9].\n";

const stub = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/models")) {
      return Response.json({ data: [{ id: "stub-model" }] });
    }
    if (url.pathname.endsWith("/chat/completions")) {
      const body = (await req.json()) as { stream?: boolean };
      if (!body.stream) {
        return Response.json({ choices: [{ message: { content: CANNED } }] });
      }
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const piece of [CANNED.slice(0, 30), CANNED.slice(30)]) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
              ),
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response("not found", { status: 404 });
  },
});

const { importBook } = await import("../server/books.ts");
const { setModelConfig } = await import("../server/model.ts");
const { runGeneration } = await import("../server/generate.ts");

setModelConfig({
  baseUrl: `http://127.0.0.1:${PORT}/v1`,
  model: "stub-model",
  maxTokens: 512,
});

const book = importBook(
  {
    title: "Smoke Test Book",
    chapters: [
      {
        number: 1,
        title: "Basics",
        sections: [
          {
            title: "Variables",
            pages: [
              { page: 1, text: "A variable stores a value in JavaScript. Declare it with const by default and let when it must be reassigned." },
              { page: 2, text: "Scope determines where a name is visible. Use the strict equality operator for comparisons." },
            ],
          },
        ],
      },
    ],
  },
  "json",
);
console.log(`indexed ${book.chunks} passages into ${process.env.CORTEX_DB}`);

let stage = "";
let text = "";
let grounding: { paragraphs: number; cited: number; invalid: number } | null = null;
const seen: string[] = [];
let failed = false;

for await (const event of runGeneration({
  request: "explain how to declare and compare values",
  bookIds: [book.bookId],
  mode: "single",
})) {
  seen.push(event.type);
  if (event.type === "status") stage = event.detail ?? event.stage;
  if (event.type === "token") text += event.text;
  if (event.type === "done") grounding = event.grounding;
  if (event.type === "error") {
    console.error(`generation error: ${event.message}`);
    failed = true;
  }
}

console.log(`\nstages: ${seen.join(" -> ")}`);
console.log(`status: ${stage}`);
console.log(`output (${text.length} chars):\n${text}`);

if (!grounding) {
  console.error("FAIL: no grounding report was produced");
  failed = true;
} else {
  console.log(`grounding: ${grounding.cited}/${grounding.paragraphs} paragraphs cited, ${grounding.invalid} unknown citation(s)`);
  if (grounding.paragraphs !== 2 || grounding.cited !== 2 || grounding.invalid !== 1) {
    console.error("FAIL: grounding audit returned unexpected numbers");
    failed = true;
  }
}

stub.stop(true);
console.log(failed ? "\nsmoke test FAILED" : "\nsmoke test passed");
process.exit(failed ? 1 : 0);
