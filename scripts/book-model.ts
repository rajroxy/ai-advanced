/**
 * Edit the model. Two real, runnable things, in one command:
 *
 *   bun run model:book                 # edit qwen2.5-coder:7b
 *   bun run model:book llama3.2:3b     # edit any local base model
 *
 * 1. WRAP — writes an Ollama Modelfile and runs `ollama create`, which produces
 *    a NEW model you own, derived from the base, with this book's strict
 *    book-only rules and generation settings baked in. `ollama show <name>`
 *    prints the whole definition; edit the Modelfile and re-run to change it.
 *
 * 2. TRAIN — writes a fine-tuning dataset built only from this book
 *    (data/model/train.jsonl + valid.jsonl) so you can push the book into the
 *    weights rather than only into the prompt. The exact commands are printed.
 *
 * Nothing is uploaded. Both outputs are plain files under data/.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBundledBook } from "../server/bookSource.ts";
import { BOOK_RULES_STRICT } from "../server/prompts.ts";
import { getModelConfig, setModelConfig, testConnection } from "../server/model.ts";

const BASE_MODEL = process.argv[2] ?? getModelConfig().model ?? "qwen2.5-coder:7b";
const DERIVED = process.env.BOOK_MODEL_NAME ?? "cortex-book";
const SOURCE = process.argv[3] ?? "javascript";

const step = (msg: string) => console.log(`\n\u25b8 ${msg}`);
const ok = (msg: string) => console.log(`  \u2713 ${msg}`);

const outDir = resolve(process.cwd(), "data", "model");
mkdirSync(outDir, { recursive: true });

const bundle = loadBundledBook(SOURCE);
console.log(`${bundle.title} — ${bundle.chapters} chapters, ${bundle.pages} pages`);

/* --------------------------------------------------------- 1. wrap it ----- */

step(`Writing a Modelfile derived from ${BASE_MODEL}`);
const modelfile = `FROM ${BASE_MODEL}

# --- generation settings -------------------------------------------------
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
PARAMETER stop "<|im_end|>"

# --- this book's rules, baked into the model ------------------------------
SYSTEM """
${BOOK_RULES_STRICT}
"""
`;
const modelfilePath = resolve(outDir, "Modelfile");
writeFileSync(modelfilePath, modelfile);
ok(`data/model/Modelfile (${modelfile.split("\n").length} lines)`);

const ollama = Bun.which("ollama");
let derivedReady = false;
if (ollama) {
  step(`Creating the derived model "${DERIVED}"`);
  const create = Bun.spawn([ollama, "create", DERIVED, "-f", modelfilePath], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await create.exited) === 0) {
    derivedReady = true;
    ok(`${DERIVED} now exists locally — inspect it with: ollama show ${DERIVED}`);
  } else {
    console.log(`  ! ollama create failed; the Modelfile is still at data/model/Modelfile`);
  }
} else {
  console.log(
    "  ! ollama is not installed, so the model was not created.\n" +
      "    Install Ollama, then run:  ollama create " +
      DERIVED +
      " -f data/model/Modelfile",
  );
}

/* -------------------------------------------------------- 2. train it ----- */

step("Building a fine-tuning dataset from this book only");

interface Pair {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
}

const pairs: Pair[] = [];
const system = { role: "system" as const, content: BOOK_RULES_STRICT };

for (const chapter of (bundle.book.chapters ?? []) as {
  title?: string;
  sections?: { title?: string; pages?: { text?: string }[] }[];
}[]) {
  for (const section of chapter.sections ?? []) {
    const pages = (section.pages ?? []).map((p) => p.text ?? "").filter(Boolean);
    if (!pages.length) continue;

    const where = [chapter.title, section.title].filter(Boolean).join(" — ");
    const answer = pages.join("\n\n");

    pairs.push({
      messages: [
        system,
        { role: "user", content: `Using the book, explain ${where}. Include the details and examples the book gives. Cite pages as [p.N].` },
        { role: "assistant", content: answer },
      ],
    });
    pairs.push({
      messages: [
        system,
        { role: "user", content: `What does the book say about ${section.title ?? where}?` },
        { role: "assistant", content: answer },
      ],
    });
  }
}

// Deterministic shuffle so the valid split is reproducible.
let seed = 0x9e3779b9;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
};
const shuffled = [...pairs].sort(() => rand() - 0.5);

const cut = Math.max(1, Math.floor(shuffled.length * 0.95));
const write = (name: string, rows: Pair[]) =>
  writeFileSync(resolve(outDir, name), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

write("train.jsonl", shuffled.slice(0, cut));
write("valid.jsonl", shuffled.slice(cut));
ok(`${pairs.length} examples → data/model/train.jsonl (${cut}) + valid.jsonl (${pairs.length - cut})`);

/* ------------------------------------------------------------- report ----- */

step("How to actually train the weights on this book");
console.log(`  # llama.cpp (CPU or GPU, works from a GGUF base)
  pip install -r requirements.txt          # llama.cpp repo
  python convert_hf_to_gguf.py base        # once
  ./llama-finetune -m base.gguf -f data/model/train.jsonl --lora-out data/model/book-lora.gguf

  # then make the trained result a model
  printf 'FROM %s\\nADAPTER data/model/book-lora.gguf\\n' "${BASE_MODEL}" > data/model/Trained
  ollama create ${DERIVED}-trained -f data/model/Trained

  # or with Unsloth on a GPU (fastest):
  #   python -c "from unsloth import FastLanguageModel; ..." using train.jsonl`);

step("Result");
if (derivedReady) {
  setModelConfig({ model: DERIVED });
  const status = await testConnection();
  ok(`generation model switched to ${DERIVED}`);
  ok(status.ok ? `connection ok — ${status.models.length} model(s)` : `connection check: ${status.error}`);
  console.log(`\n${DERIVED} is yours: change data/model/Modelfile and re-run to re-edit it.\n`);
} else {
  console.log(
    `\nFiles are ready in data/model/. Once Ollama is running:\n` +
      `  ollama create ${DERIVED} -f data/model/Modelfile\n` +
      `  then set the model name in Settings to ${DERIVED}.\n`,
  );
}
