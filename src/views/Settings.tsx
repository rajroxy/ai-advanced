import { useEffect, useState } from "react";
import {
  Check,
  Cpu,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  Scale,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "../state";
import { api, type ModelConfig, type ModelStatus, type PlannerConfig } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
} from "../components/ui";

function GuideStep({
  n,
  title,
  lines,
  url,
}: {
  n: string;
  title: string;
  lines: string[];
  url: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/50 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-ember-500/15 font-mono text-[10px] text-ember-400">
          {n}
        </span>
        <span className="text-paper-100">{title}</span>
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950/70 p-2.5 font-mono text-[11px] text-paper-200/75">
        {lines.join("\n")}
      </pre>
      <p className="mt-2 font-mono text-[10px] text-mint-400/80">base URL · {url}</p>
    </div>
  );
}

export default function Settings() {
  const { model, planner, reloadAll } = useApp();
  const [draft, setDraft] = useState<Partial<ModelConfig>>({});
  const [plannerDraft, setPlannerDraft] = useState<Partial<PlannerConfig>>({});
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const current: ModelConfig = {
    baseUrl: draft.baseUrl ?? model?.baseUrl ?? "http://127.0.0.1:11434/v1",
    model: draft.model ?? model?.model ?? "",
    apiKey: draft.apiKey ?? model?.apiKey ?? "local",
    temperature: draft.temperature ?? model?.temperature ?? 0.4,
    maxTokens: draft.maxTokens ?? model?.maxTokens ?? 2048,
    contextChunks: draft.contextChunks ?? model?.contextChunks ?? 10,
    strictGrounding: draft.strictGrounding ?? model?.strictGrounding ?? true,
  };
  const currentPlanner: PlannerConfig = {
    enabled: plannerDraft.enabled ?? planner?.enabled ?? false,
    model: plannerDraft.model ?? planner?.model ?? "",
    temperature: plannerDraft.temperature ?? planner?.temperature ?? 0.2,
    maxTokens: plannerDraft.maxTokens ?? planner?.maxTokens ?? 512,
  };

  useEffect(() => {
    if (draft.baseUrl === undefined && model) setDraft({});
  }, [model, draft.baseUrl]);

  async function test() {
    setTesting(true);
    setStatus(null);
    try {
      const [result] = await Promise.all([
        api.testModel(),
        api.updateSettings({ model: current }).then(() => undefined),
      ]);
      setStatus(result);
    } catch (err) {
      setStatus({
        ok: false,
        baseUrl: current.baseUrl,
        model: current.model,
        models: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateSettings({ model: current, planner: currentPlanner });
      setDraft({});
      setPlannerDraft({});
      await reloadAll();
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Local model host"
        description="Any OpenAI-compatible endpoint running on your machine: Ollama, llama.cpp, LM Studio, OpenLLM or vLLM. Nothing is sent to a cloud."
        actions={
          status ? (
            <Badge tone={status.ok ? "mint" : "warn"}>
              {status.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {status.ok ? "connected" : "not reachable"}
            </Badge>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-paper-100">
            <Cpu className="h-4 w-4 text-ember-400" /> Generation model
          </div>
          <div className="space-y-4">
            <div>
              <Label>Base URL (OpenAI-compatible)</Label>
              <Input
                value={current.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="http://127.0.0.1:11434/v1"
                className="font-mono text-xs"
              />
              <p className="mt-1.5 text-[11px] text-paper-300/40">
                Ollama: http://127.0.0.1:11434/v1 · llama.cpp: http://127.0.0.1:8080/v1
              </p>
            </div>

            <div>
              <Label>Model</Label>
              <div className="flex gap-2">
                <Input
                  value={current.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  placeholder="qwen2.5:7b"
                  className="font-mono text-xs"
                />
                <Button variant="secondary" onClick={test} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              {status?.models && status.models.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {status.models.slice(0, 12).map((m) => (
                    <button
                      key={m}
                      onClick={() => setDraft({ ...draft, model: m })}
                      className={`rounded-lg border px-2 py-1 font-mono text-[11px] transition ${
                        current.model === m
                          ? "border-ember-500/40 bg-ember-500/12 text-ember-400"
                          : "border-white/10 text-paper-300/50 hover:border-white/20"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Temperature</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={current.temperature}
                  onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Max output tokens</Label>
                <Input
                  type="number"
                  value={current.maxTokens}
                  onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>API key</Label>
                <Input
                  value={current.apiKey}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  placeholder="local"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label>Passages per step</Label>
                <Input
                  type="number"
                  min="3"
                  max="40"
                  value={current.contextChunks}
                  onChange={(e) => setDraft({ ...draft, contextChunks: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-ink-900/50 p-3">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={current.strictGrounding}
                  onChange={(e) => setDraft({ ...draft, strictGrounding: e.target.checked })}
                  className="mt-0.5 accent-ember-500"
                />
                <span>
                  <span className="block text-sm text-paper-100">Book-only strict mode</span>
                  <span className="block text-[11px] leading-relaxed text-paper-300/50">
                    Tells the model that anything it knows from training is unavailable: every
                    factual sentence must cite a retrieved passage, and anything the book does not
                    cover is reported as a gap ({`[not in book]`}) instead of being filled from
                    memory. Leave this on unless you deliberately want the model to reason beyond
                    the book.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2 text-sm text-paper-100">
              <Zap className="h-4 w-4 text-mint-400" /> Planner model (optional)
            </div>
            <p className="mb-4 text-[11px] text-paper-300/45">
              A small fast model for search planning and section outlines. Leave off to use the main
              model for everything.
            </p>
            <label className="mb-4 flex items-center gap-2 text-sm text-paper-300/70">
              <input
                type="checkbox"
                checked={currentPlanner.enabled}
                onChange={(e) => setPlannerDraft({ ...plannerDraft, enabled: e.target.checked })}
                className="accent-ember-500"
              />
              Enable a separate planner model
            </label>
            {currentPlanner.enabled && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Model</Label>
                  <Input
                    value={currentPlanner.model}
                    onChange={(e) => setPlannerDraft({ ...plannerDraft, model: e.target.value })}
                    placeholder="qwen2.5:1.5b"
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <Label>Temp</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={currentPlanner.temperature}
                    onChange={(e) => setPlannerDraft({ ...plannerDraft, temperature: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Max tokens</Label>
                  <Input
                    type="number"
                    value={currentPlanner.maxTokens}
                    onChange={(e) => setPlannerDraft({ ...plannerDraft, maxTokens: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2 text-sm text-paper-100">
              <Scale className="h-4 w-4 text-amber-300" /> Why the weights are not "cleaned"
            </div>
            <p className="text-[11px] leading-relaxed text-paper-300/50">
              A model's world knowledge and its language ability are stored in the same numbers, so
              there is no way to delete the facts and keep the grammar. Fine-tuning to forget,
              abliteration and pruning all cause catastrophic forgetting instead — the model gets
              worse at everything, not cleaner. Quantisation is lossy number compression, not
              knowledge removal. "Language + reasoning only" is not a carveable subset of the
              weights.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-paper-300/50">
              So this engine does not try. Knowledge lives outside the weights, in the SQLite index,
              and the model never sees more than the handful of passages a query retrieves. Strict
              mode plus the grounding readout ({`grounded N/M`}) is what makes that claim
              checkable: an answer that is not traceable to a passage is visible as uncited text or
              an unknown citation.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-paper-300/45">
              You can still edit the model, and the project gives you the tools:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950/70 p-2.5 font-mono text-[11px] text-paper-200/75">
              {"bun run model:book          # wrap a model with this book's rules\n" +
                "bun run model:book llama3.2:3b"}
            </pre>
            <p className="mt-2 text-[11px] leading-relaxed text-paper-300/45">
              It writes a Modelfile, runs <span className="font-mono">ollama create</span> to build a
              derived model you own, and exports a fine-tuning dataset built only from this book
              plus the exact training commands. Fine-tuning puts the book into the weights; it does
              not delete the base model's other knowledge, because the parameters are shared. Only a
              model trained from scratch on the book alone has none — that dataset is the starting
              point for it.
            </p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-paper-100">
              <PlugZap className="h-4 w-4 text-ember-400" /> Connection
            </div>
            {status ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  status.ok
                    ? "border-mint-500/25 bg-mint-500/[0.07] text-mint-400"
                    : "border-amber-500/25 bg-amber-500/[0.07] text-amber-300"
                }`}
              >
                {status.ok ? (
                  `Connected to ${status.baseUrl} — ${status.models.length} model(s) available.`
                ) : (
                  <>
                    <p>Could not reach {status.baseUrl}.</p>
                    <p className="mt-1 text-[11px] opacity-80">
                      Nothing is listening there yet. Start a local model server (see the setup guide
                      below), then test again.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-paper-300/50">
                Test the connection to make sure the engine can talk to your local model.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Test connection
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saved ? "Saved" : "Save settings"}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-paper-100">
              <Terminal className="h-4 w-4 text-mint-400" /> Getting a model running
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-paper-300/50">
              Pick one host. All of them stay offline, and none of them need a GPU.
            </p>

            <div className="space-y-3 text-xs">
              <GuideStep
                n="1"
                title="Ollama — easiest, no GGUF file"
                lines={[
                  "# install from ollama.com, then:",
                  "ollama pull qwen2.5-coder:7b",
                  "ollama serve",
                ]}
                url="http://127.0.0.1:11434/v1"
              />
              <GuideStep
                n="2"
                title="LM Studio — desktop app"
                lines={[
                  "# download a model inside the app, then:",
                  "# Developer \u25b8 Start Server",
                ]}
                url="http://127.0.0.1:1234/v1"
              />
              <GuideStep
                n="3"
                title="llama.cpp — you fetch a .gguf"
                lines={[
                  "# grab a *-Q4_K_M.gguf from Hugging Face",
                  "llama-server -m model.gguf --port 8080",
                ]}
                url="http://127.0.0.1:8080/v1"
              />
              <GuideStep
                n="4"
                title="OpenLLM"
                lines={["openllm serve <model>"]}
                url="the /v1 URL it prints"
              />
            </div>

            <div className="mt-4 rounded-xl border border-ember-500/20 bg-ember-500/[0.06] p-3 text-[11px] leading-relaxed text-paper-300/60">
              <p className="font-medium text-ember-400/90">Run the app on your own machine</p>
              <p className="mt-1">
                Then <code className="font-mono text-paper-200/80">127.0.0.1</code> means your
                computer. A hosted preview runs in a remote sandbox, so it cannot reach a model on
                your laptop no matter what you enter here.
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950/70 p-2.5 font-mono text-[11px] text-paper-200/75">
                {"bun install && bun run seed && bun run dev"}
              </pre>
            </div>

            <div className="mt-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3 text-[11px] leading-relaxed text-paper-300/55">
              <p className="font-medium text-paper-300/75">Nothing else to install</p>
              <p className="mt-1">
                No IndexedDB, no SQLite driver, no Docker, no Python, no WebAssembly. Books, memory
                and history live in a local SQLite file the engine already manages.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
