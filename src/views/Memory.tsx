import { useCallback, useEffect, useState } from "react";
import { Boxes, History, Pin, Plus, Trash2 } from "lucide-react";
import { useApp } from "../state";
import { api, type Generation, type Memory as MemoryRow } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "../components/ui";

const KINDS = ["fact", "decision", "style", "generation", "todo"];

export default function Memory() {
  const { projects, reloadAll } = useApp();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [history, setHistory] = useState<Generation[]>([]);
  const [newProject, setNewProject] = useState("");
  const [draft, setDraft] = useState({ title: "", content: "", kind: "fact", pinned: false });

  const load = useCallback(async (id: string | null) => {
    if (!id) {
      setMemories([]);
      setHistory([]);
      return;
    }
    const [m, g] = await Promise.all([api.memories(id), api.generations(id)]);
    setMemories(m.memories);
    setHistory(g.generations);
  }, []);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  useEffect(() => {
    void load(projectId);
  }, [projectId, load]);

  async function createProject() {
    if (!newProject.trim()) return;
    const { project } = await api.createProject(newProject);
    setNewProject("");
    await reloadAll();
    setProjectId(project.id);
  }

  async function addMemory() {
    if (!projectId || !draft.title.trim()) return;
    await api.addMemory(projectId, draft);
    setDraft({ title: "", content: "", kind: "fact", pinned: false });
    await load(projectId);
    await reloadAll();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Memory"
        title="Project memory"
        description="Facts, decisions and style notes the AI carries into every generation. Stored locally in SQLite and retrieved like book passages."
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label>Active project</Label>
            <select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="w-full rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-ember-500/70"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px]">
            <Label>New project</Label>
            <div className="flex gap-2">
              <Input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="e.g. C# CSV tool"
              />
              <Button onClick={createProject} disabled={!newProject.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {!projectId ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="Create a project to start remembering"
          description="A project groups memories and generation history, so a new session continues where the last one stopped."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div>
            <Card className="mb-5 p-5">
              <Label>Remember something</Label>
              <div className="space-y-3">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Short title, e.g. “Target framework: .NET 8”"
                />
                <Textarea
                  rows={3}
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder="The detail the AI should keep in mind…"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                    className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm text-paper-100 outline-none"
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-paper-300/70">
                    <input
                      type="checkbox"
                      checked={draft.pinned}
                      onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                      className="accent-ember-500"
                    />
                    Always include
                  </label>
                  <Button className="ml-auto" onClick={addMemory} disabled={!draft.title.trim()}>
                    <Plus className="h-4 w-4" /> Add memory
                  </Button>
                </div>
              </div>
            </Card>

            {memories.length === 0 ? (
              <EmptyState title="No memories yet" description="Add a fact or decision above." />
            ) : (
              <div className="space-y-2">
                {memories.map((m) => (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {m.pinned ? <Pin className="h-3.5 w-3.5 text-ember-400" /> : null}
                          <span className="text-sm font-medium text-paper-100">{m.title}</span>
                          <Badge tone={m.kind === "decision" ? "mint" : "neutral"}>{m.kind}</Badge>
                        </div>
                        {m.content && (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-paper-300/70">
                            {m.content}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await api.updateMemory(m.id, { pinned: !m.pinned });
                            await load(projectId);
                          }}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-300/80"
                          onClick={async () => {
                            await api.deleteMemory(m.id);
                            await load(projectId);
                            await reloadAll();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-paper-300/50">
                <History className="h-3.5 w-3.5" /> History
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-paper-300/40">No generations in this project yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.slice(0, 12).map((gen) => (
                    <details key={gen.id} className="rounded-lg border border-white/[0.06] bg-ink-900/50 px-3 py-2">
                      <summary className="cursor-pointer text-xs text-paper-200/80">
                        {gen.prompt.slice(0, 70)}
                      </summary>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-paper-300/40">
                        <span>{gen.mode}</span>
                        <span>{new Date(gen.created_at).toLocaleString()}</span>
                        <button
                          className="ml-auto text-red-300/70 hover:text-red-300"
                          onClick={async () => {
                            await api.deleteGeneration(gen.id);
                            await load(projectId);
                          }}
                        >
                          delete
                        </button>
                      </div>
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] text-paper-300/50">
                        {gen.output}
                      </p>
                    </details>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
