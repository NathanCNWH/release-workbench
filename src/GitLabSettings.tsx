import { useEffect, useState, type FormEvent } from "react";
import { GitPullRequest, RefreshCw, Save } from "lucide-react";
import { api, post } from "./api";
import { Button, Empty, Field } from "./ui";
import { memberLabel, type GitLabMember, type GitLabRepository } from "./gitLabTypes";

interface Settings {
  revision: number;
  repositories: GitLabRepository[];
}

interface Connection {
  account: GitLabMember;
  members: GitLabMember[];
  targetBranch: string;
}

interface RepositoryFormProps {
  projectId: string;
  repository: GitLabRepository;
  revision: number;
  onSave: (settings: Settings) => void;
}

function RepositoryForm({ projectId, repository, revision, onSave }: RepositoryFormProps) {
  const [apiAddress, setApiAddress] = useState(repository.apiAddress);
  const [targetBranch, setTargetBranch] = useState(repository.targetBranch);
  const [assigneeId, setAssigneeId] = useState(String(repository.defaultAssignee?.id ?? ""));
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<"checking" | "saving" | "">("");
  const [error, setError] = useState("");
  const identity = { projectId, repositoryKey: repository.repositoryKey };
  const options = connection?.members ?? [];
  const savedAssignee = repository.defaultAssignee;
  const showSavedAssignee = savedAssignee && !options.some((member) => member.id === savedAssignee.id);

  async function check() {
    setBusy("checking");
    setError("");
    try {
      const result = await post<Connection>("/gitlab/connection/check", {
        ...identity, apiAddress: apiAddress.trim(),
      });
      setConnection(result);
    } catch (e) {
      setConnection(null);
      setError(e instanceof Error ? e.message : "GitLab 连接失败。");
    } finally {
      setBusy("");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("saving");
    setError("");
    try {
      const settings = await api<Settings>("/gitlab/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...identity, revision, apiAddress: apiAddress.trim(), targetBranch: targetBranch.trim(),
          assigneeId: assigneeId ? Number(assigneeId) : null,
        }),
      });
      onSave(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitLab 设置保存失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <form className="gitlab-settings-form" onSubmit={(event) => void save(event)}>
      <div className="form-grid gitlab-inputs">
        <Field label="GitLab API 地址" hint="填写此 GitLab 实例的 HTTPS 地址。同一项目内同一主机的仓库共用。">
          <input
            type="url"
            value={apiAddress}
            placeholder={repository.defaultApiAddress}
            maxLength={2000}
            disabled={!!busy}
            onChange={(event) => {
              setApiAddress(event.target.value);
              setConnection(null);
              setAssigneeId(String(repository.defaultAssignee?.id ?? ""));
            }}
          />
        </Field>
        <Field label="默认目标分支">
          <input
            value={targetBranch}
            placeholder={connection?.targetBranch || "GitLab 仓库的默认分支"}
            maxLength={160}
            disabled={!!busy}
            onChange={(event) => setTargetBranch(event.target.value)}
          />
        </Field>
        <Field label="默认合并人" hint={connection ? undefined : "检查连接后可以选择 GitLab 成员。"}>
          <select
            value={assigneeId}
            disabled={!!busy || !connection}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">尚未设置</option>
            {showSavedAssignee && (
              <option value={savedAssignee.id} disabled={!!connection}>
                {memberLabel(savedAssignee)}{connection ? "（不在当前成员列表中）" : ""}
              </option>
            )}
            {options.map((member) => (
              <option key={member.id} value={member.id}>{memberLabel(member)}</option>
            ))}
          </select>
        </Field>
      </div>
      {connection && (
        <p className="muted small" role="status">GitLab 已连接，当前账号 {memberLabel(connection.account)}。</p>
      )}
      {error && <div className="error-message" role="alert">{error}</div>}
      <div className="actions">
        <Button onClick={() => void check()} disabled={!!busy}>
          <RefreshCw size={15} /> {busy === "checking" ? "检查中…" : "检查连接"}
        </Button>
        <Button type="submit" variant="primary" disabled={!!busy}>
          <Save size={15} /> {busy === "saving" ? "保存中…" : "保存设置"}
        </Button>
      </div>
    </form>
  );
}

export default function GitLabSettings({
  projectId, projectName, notify,
}: {
  projectId: string;
  projectName: string;
  notify: (message: string) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!projectId);
  const [readVersion, reload] = useState(0);
  const repository = settings?.repositories.find((item) => item.repositoryKey === selected)
    ?? settings?.repositories[0];

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<Settings>("/gitlab/settings?projectId=" + encodeURIComponent(projectId), {
      signal: controller.signal,
    }).then((data) => {
      if (!controller.signal.aborted) setSettings(data);
    }).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [projectId, readVersion]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>GitLab 设置</h1>
          <p>{projectName}</p>
        </div>
      </div>
      <section className="panel gitlab-settings">
        <div className="panel-heading">
          <div className="inline">
            <span className="component-icon"><GitPullRequest size={22} /></span>
            <div>
              <h2>仓库设置</h2>
              <p>使用本机保存的 GitLab key。</p>
            </div>
          </div>
          <Button disabled={loading || !projectId} onClick={() => reload((value) => value + 1)}>
            <RefreshCw size={15} /> 重新读取
          </Button>
        </div>
        {loading ? <p className="muted" role="status">正在读取仓库设置…</p> : error ? (
          <div className="error-message" role="alert">{error}</div>
        ) : repository && settings ? (
          <>
            <Field label="Git 地址">
              <select value={repository.repositoryKey} onChange={(event) => setSelected(event.target.value)}>
                {settings.repositories.map((item) => (
                  <option key={item.repositoryKey} value={item.repositoryKey}>
                    {item.repository}
                  </option>
                ))}
              </select>
            </Field>
            <RepositoryForm
              key={repository.repositoryKey + ":" + settings.revision}
              projectId={projectId}
              repository={repository}
              revision={settings.revision}
              onSave={(data) => {
                setSettings(data);
                notify("GitLab 设置已保存。");
              }}
            />
          </>
        ) : <Empty title="暂无 Git 仓库" detail="在服务管理里登记仓库后，可设置默认合并人。" />}
      </section>
    </>
  );
}
