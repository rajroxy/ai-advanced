import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  type Book,
  type LibraryStats,
  type ModelConfig,
  type PlannerConfig,
  type Project,
} from "./lib/api";

interface AppState {
  books: Book[];
  projects: Project[];
  stats: LibraryStats | null;
  model: ModelConfig | null;
  planner: PlannerConfig | null;
  loading: boolean;
  reloadBooks: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [model, setModel] = useState<ModelConfig | null>(null);
  const [planner, setPlanner] = useState<PlannerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadBooks = useCallback(async () => {
    const { books } = await api.books();
    setBooks(books);
  }, []);

  const reloadProjects = useCallback(async () => {
    const { projects } = await api.projects();
    setProjects(projects);
  }, []);

  const reloadSettings = useCallback(async () => {
    const settings = await api.settings();
    setModel(settings.model);
    setPlanner(settings.planner);
  }, []);

  const reloadAll = useCallback(async () => {
    const [health, bookList, projectList] = await Promise.all([
      api.health(),
      api.books(),
      api.projects(),
    ]);
    setBooks(bookList.books);
    setProjects(projectList.projects);
    setStats(health.stats);
    setModel(health.model);
    const settings = await api.settings();
    setPlanner(settings.planner);
  }, []);

  useEffect(() => {
    reloadAll()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [reloadAll]);

  const value = useMemo<AppState>(
    () => ({
      books,
      projects,
      stats,
      model,
      planner,
      loading,
      reloadBooks,
      reloadProjects,
      reloadSettings,
      reloadAll,
    }),
    [books, projects, stats, model, planner, loading, reloadBooks, reloadProjects, reloadSettings, reloadAll],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
