import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import type {
  Project,
  Release,
  Environment,
  JenkinsProfile,
  Deployment,
  Backup,
} from "./types";
import { api } from "./api";

type Collections = {
  projects: Project[];
  releases: Release[];
  environments: Environment[];
  jenkinsProfiles: JenkinsProfile[];
};
type State = {
  [K in keyof Collections]: { data: Collections[K]; revision: number };
} & { deployments: Deployment[]; backups: Backup[] };
type Workbench = {
  state: State;
  pending: number;
  error: string;
  clearError: () => void;
  refresh: () => Promise<void>;
  update: <K extends keyof Collections>(
    key: K,
    action: SetStateAction<Collections[K]>,
  ) => Promise<void>;
};
const Context = createContext<Workbench | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(0);
  const current = useRef<State | null>(null),
    queue = useRef(Promise.resolve()),
    writes = useRef(0),
    mounted = useRef(false);
  async function refresh() {
    const initial = !current.current;
    const fresh = await api<State>("/state");
    if (writes.current) {
      if (current.current) {
        const value = {
          ...current.current,
          deployments: fresh.deployments,
          backups: fresh.backups,
        };
        current.current = value;
        if (mounted.current) setState(value);
      }
    } else {
      current.current = fresh;
      if (mounted.current) setState(fresh);
    }
    if (mounted.current)
      setError((previous) =>
        initial || previous.startsWith("无法同步服务器资料：") ? "" : previous,
      );
  }
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((e) => setError(e.message));
    const interval = setInterval(
      () =>
        void refresh().catch((e) =>
          setError(`无法同步服务器资料：${e.message}`),
        ),
      3000,
    );
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);
  function update<K extends keyof Collections>(
    key: K,
    action: SetStateAction<Collections[K]>,
  ): Promise<void> {
    writes.current++;
    setPending(writes.current);
    const task = queue.current.then(async () => {
      const before = current.current![key] as {
        data: Collections[K];
        revision: number;
      };
      const data =
        typeof action === "function"
          ? (action as (value: Collections[K]) => Collections[K])(before.data)
          : action;
      const saved = await api(`/state/${key}`, {
        method: "PUT",
        body: JSON.stringify({ data, revision: before.revision }),
      });
      const value = { ...current.current!, [key]: saved };
      current.current = value;
      setState(value);
    });
    queue.current = task
      .catch(async (e) => {
        setError(`保存失败：${e.message}`);
      })
      .finally(() => {
        writes.current--;
        setPending(writes.current);
      });
    return task;
  }
  if (!state)
    return (
      <div className="boot-screen">
        <h1>Release Workbench</h1>
        <p>{error || "正在连接本地服务…"}</p>
        {error && <button onClick={() => location.reload()}>重新连接</button>}
      </div>
    );
  return (
    <Context.Provider
      value={{
        state,
        pending,
        error,
        clearError: () => setError(""),
        refresh,
        update,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkbench() {
  const value = useContext(Context);
  if (!value) throw new Error("应用未连接本地资料");
  return value;
}
export function useCollection<K extends keyof Collections>(
  key: K,
): [Collections[K], Dispatch<SetStateAction<Collections[K]>>] {
  const context = useWorkbench();
  return [
    context.state[key].data as Collections[K],
    (action) => {
      void context.update(key, action).catch(() => {});
    },
  ];
}
