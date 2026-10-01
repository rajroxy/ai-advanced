/**
 * One command to get a local model running for Cortex Book.
 *
 *   bun run model                 # qwen2.5-coder:7b, the default
 *   bun run model llama3.2:3b     # any Ollama model tag
 *
 * It finds Ollama, starts its server if nothing is on the port, downloads the
 * model, points the engine at it, and verifies the connection. Everything stays
 * on your machine — no cloud, no API key.
 */

import { getModelConfig, listModels, setModelConfig, testConnection } from "../server/model.ts";

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1";
const MODEL = process.argv[2] ?? "qwen2.5-coder:7b";

const ok = (msg: string) => console.log(`  \u2713 ${msg}`);
const step = (msg: string) => console.log(`\n\u25b8 ${msg}`);
const die = (msg: string, code = 1): never => {
  console.error(`\n  \u2717 ${msg}`);
  process.exit(code);
};

/* 1 — is Ollama installed? -------------------------------------------------- */

step("Looking for Ollama");
const ollama =
  Bun.which("ollama") ??
  die(
    [
      "Ollama is not on your PATH.",
      "",
      "  macOS / Windows  → install from https://ollama.com/download",
      "  Linux            → curl -fsSL https://ollama.com/install.sh | sh",
      "",
      "Then run `bun run model` again. Any OpenAI-compatible host works too —",
      "set its base URL in Settings and skip this script.",
    ].join("\n"),
  );
ok(`found ${ollama}`);

/* 2 — make sure something is serving --------------------------------------- */

step("Starting the model server if needed");
setModelConfig({ baseUrl: BASE_URL });

async function reachable(): Promise<boolean> {
  try {
    await listModels();
    return true;
  } catch {
    return false;
  }
}

if (await reachable()) {
  ok(`already serving at ${BASE_URL}`);
} else {
  const server = Bun.spawn([ollama, "serve"], { stdio: ["ignore", "ignore", "ignore"] });
  let up = false;
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(500);
    if (await reachable()) {
      up = true;
      break;
    }
  }
  if (!up) {
    server.kill();
    die(
      `ollama serve did not come up at ${BASE_URL} within 15s. Start it in another terminal and try again.`,
    );
  }
  ok(`started ollama serve (pid ${server.pid})`);
}

/* 3 — download the model ---------------------------------------------------- */

step(`Downloading ${MODEL} (this can take a few minutes the first time)`);
const pull = Bun.spawn([ollama, "pull", MODEL], { stdout: "inherit", stderr: "inherit" });
if ((await pull.exited) !== 0) {
  die(`Could not download "${MODEL}". Check the tag at https://ollama.com/library.`);
}

/* 4 — point the engine at it and verify ------------------------------------- */

step("Verifying");
setModelConfig({ baseUrl: BASE_URL, model: MODEL });
const status = await testConnection();
if (!status.ok) die(`Saved the settings, but the connection check failed: ${status.error}`);

ok(`connected — ${status.models.length} model(s) available at ${status.baseUrl}`);
ok(`generation model set to ${getModelConfig().model}`);

console.log("\nDone. Start the app with `bun run dev` and generate from the book.\n");
