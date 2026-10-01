import { getJsonSetting, setSetting } from "./db.ts";

/**
 * The model host is fully local. We only speak the OpenAI-compatible HTTP API,
 * so any offline runner works: Ollama, llama.cpp server, LM Studio, vLLM,
 * OpenLLM, text-generation-webui. No cloud calls, no API keys required.
 */

export interface ModelConfig {
  /** Base URL including version, e.g. http://127.0.0.1:11434/v1 */
  baseUrl: string;
  /** Main generation model. */
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  /** How many book passages to retrieve per step. */
  contextChunks: number;
  /**
   * Book-only mode. When on, the model is told that anything it knows from
   * training is unavailable, every factual sentence must be cited, and a gap
   * must be reported as "[not in book]" rather than filled from memory.
   */
  strictGrounding: boolean;
}

export interface PlannerConfig {
  /** Optional small/fast model for search planning + section outlines. */
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_MODEL: ModelConfig = {
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen2.5-coder:7b",
  apiKey: "local",
  temperature: 0.4,
  maxTokens: 2048,
  contextChunks: 10,
  strictGrounding: true,
};

export const DEFAULT_PLANNER: PlannerConfig = {
  enabled: false,
  model: "qwen2.5:1.5b",
  temperature: 0.2,
  maxTokens: 512,
};

export function getModelConfig(): ModelConfig {
  return { ...DEFAULT_MODEL, ...getJsonSetting<Partial<ModelConfig>>("model", {}) };
}

export function setModelConfig(patch: Partial<ModelConfig>): ModelConfig {
  const next = { ...getModelConfig(), ...patch };
  setSetting("model", JSON.stringify(next));
  return next;
}

export function getPlannerConfig(): PlannerConfig {
  return { ...DEFAULT_PLANNER, ...getJsonSetting<Partial<PlannerConfig>>("planner", {}) };
}

export function setPlannerConfig(patch: Partial<PlannerConfig>): PlannerConfig {
  const next = { ...getPlannerConfig(), ...patch };
  setSetting("planner", JSON.stringify(next));
  return next;
}

/* ------------------------------------------------------------- transport -- */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

const trimBase = (url: string) => url.replace(/\/+$/, "");

async function chatRequest(
  messages: ChatMessage[],
  opts: ChatOptions,
  stream: boolean,
): Promise<Response> {
  const cfg = getModelConfig();
  const res = await fetch(`${trimBase(cfg.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.model ?? cfg.model,
      messages,
      temperature: opts.temperature ?? cfg.temperature,
      max_tokens: opts.maxTokens ?? cfg.maxTokens,
      stream,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Model request failed (${res.status}). ${detail.slice(0, 400) || "Is the local model server running?"}`,
    );
  }
  return res;
}

/** One-shot completion. */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await chatRequest(messages, opts, false);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Streaming completion, yielding token deltas. */
export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const res = await chatRequest(messages, opts, true);
  if (!res.body) {
    yield await chat(messages, opts);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* partial JSON across chunks — ignore */
      }
    }
  }
}

/* ---------------------------------------------------------- diagnostics --- */

export interface ModelStatus {
  ok: boolean;
  baseUrl: string;
  model: string;
  models: string[];
  error?: string;
}

export async function listModels(): Promise<string[]> {
  const cfg = getModelConfig();
  const res = await fetch(`${trimBase(cfg.baseUrl)}/models`, {
    headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`Model server returned ${res.status}`);
  const data = (await res.json()) as { data?: { id?: string }[]; models?: { name?: string }[] };
  const ids = (data.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
  const names = (data.models ?? []).map((m) => m.name).filter((x): x is string => !!x);
  return [...new Set([...ids, ...names])].sort();
}

export async function testConnection(): Promise<ModelStatus> {
  const cfg = getModelConfig();
  try {
    const models = await listModels();
    return { ok: true, baseUrl: cfg.baseUrl, model: cfg.model, models };
  } catch (err) {
    return {
      ok: false,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
