import { useEffect, useState } from "react";
import { GitBranch, Play, RefreshCw, Workflow } from "lucide-react";
import type {
  Deployment,
  Environment,
  JenkinsProfile,
  Service,
  Release,
  ServiceBuild,
  VersionMerge,
} from "./types";
import { Badge, Button, Empty, Field, Modal, Note } from "./ui";
import { api, post } from "./api";
import { VersionPicker, VersionResources } from "./VersionMerge";
const done = (status: string) =>
  ["成功", "失败", "部分失败", "结果未知", "已中止"].includes(status);

export default function LivePublishDialog({
  projectId,
  projectName,
  environments,
  initialEnvironmentId,
  services,
  profiles,
  version,
  versions,
  onComplete,
  onClose,
  onConfigure,
}: {
  projectId: string;
  projectName: string;
  environments: Environment[];
  initialEnvironmentId: string;
  services: Service[];
  profiles: JenkinsProfile[];
  version?: Release;
  versions: Release[];
  onComplete: (record: Deployment) => void;
  onClose: () => void;
  onConfigure: () => void;
}) {
  const [environmentId, setEnvironmentId] = useState(
    initialEnvironmentId || environments[0]?.id || "",
  );
  const [selected, setSelected] = useState<string[]>([]),
    [branches, setBranches] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<any>(null),
    [record, setRecord] = useState<Deployment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [versionIds, setVersionIds] = useState<string[]>(
    version ? [version.id] : [],
  );
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [merge, setMerge] = useState<VersionMerge | null>(null),
    [mergeError, setMergeError] = useState(""),
    [merging, setMerging] = useState(false);
  const versionKey = JSON.stringify(
    versions.filter((v) => versionIds.includes(v.id)),
  );
  useEffect(() => {
    let current = true;
    setMerging(true);
    setMergeError("");
    void post<VersionMerge>("/versions/merge", {
      projectId,
      environmentId: environmentId || undefined,
      versionIds,
      resolutions,
    })
      .then((result) => {
        if (current) setMerge(result);
      })
      .catch((e) => {
        if (current) {
          setMerge(null);
          setMergeError(e.message);
        }
      })
      .finally(() => {
        if (current) setMerging(false);
      });
    return () => {
      current = false;
    };
  }, [
    projectId,
    environmentId,
    JSON.stringify(versionIds),
    JSON.stringify(resolutions),
    versionKey,
  ]);
  const environment = environments.find((e) => e.id === environmentId);
  useEffect(() => {
    if (!record || done(record.status)) return;
    const timer = setInterval(
      () =>
        void api<Deployment>(`/deployments/${record.id}`)
          .then(setRecord)
          .catch((e) => setError(e.message)),
      2000,
    );
    return () => clearInterval(timer);
  }, [record?.id, record?.status]);
  const reset = () => {
    setPlan(null);
    setError("");
  };
  const reason = (service: Service) => {
    const binding = environment?.bindings.find(
        (b) => b.serviceId === service.id,
      ),
      profile = profiles.find(
        (p) => p.id === (service.kind === "前端应用" ? "frontend" : "backend"),
      );
    if (!binding?.job) return "当前环境未绑定 Job";
    if (!profile?.url || !profile.username || !profile.credentialConfigured)
      return "全局 Jenkins 尚未配置完整";
    if (
      binding.supportsBranch &&
      (!binding.branchParameter ||
        !binding.branches.includes(binding.defaultBranch))
    )
      return "分支配置不完整";
    return "";
  };
  async function preview() {
    setBusy(true);
    setError("");
    try {
      setPlan(
        await post("/deployments/preview", {
          projectId,
          environmentId,
          versionIds,
          resolutions,
          selections: selected.map((serviceId) => ({
            serviceId,
            branch: environment?.bindings.find((b) => b.serviceId === serviceId)
              ?.supportsBranch
              ? branches[serviceId] ||
                environment?.bindings.find((b) => b.serviceId === serviceId)
                  ?.defaultBranch
              : "",
          })),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      const result = await post<Deployment>("/deployments/run", {
        planId: plan.id,
        confirmed: true,
      });
      setRecord(result);
      onComplete(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "发布进度" : "发布服务"}
      subtitle={`${projectName} · ${versionIds.length ? `合并 ${versionIds.length} 个版本的发布资料` : "独立发布（不关联版本）"}`}
      wide
      onClose={onClose}
    >
      <div className="modal-body publish-body">
        <Note>
          仅触发选中服务的 Jenkins Job。SQL
          与配置由人工处理；关闭窗口不会中止远端构建。
        </Note>
        {error && (
          <div role="alert" className="error-message">
            {error}
          </div>
        )}
        {!record ? (
          <>
            <VersionPicker
              versions={versions}
              selected={versionIds}
              disabled={busy}
              onChange={(ids) => {
                setVersionIds(ids);
                setResolutions({});
                reset();
              }}
            />
            <div className="publish-target">
              <span className="number-chip">01</span>
              <Field label="选择环境">
                <select
                  disabled={busy}
                  value={environmentId}
                  onChange={(e) => {
                    setEnvironmentId(e.target.value);
                    setSelected([]);
                    setBranches({});
                    setResolutions({});
                    reset();
                  }}
                >
                  <option value="" disabled>
                    请选择环境
                  </option>
                  {environments.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <span className="muted small">
                {environment
                  ? `${environment.deployPath || "未登记共用路径"} · 主机按服务关联`
                  : "请先创建项目环境"}
              </span>
            </div>
            <div className="between publish-service-heading">
              <div className="inline">
                <span className="number-chip">02</span>
                <h3>选择发布服务 · 已选 {selected.length} 项</h3>
              </div>
              <Button
                disabled={busy}
                onClick={() => {
                  setSelected(
                    selected.length
                      ? []
                      : services.filter((s) => !reason(s)).map((s) => s.id),
                  );
                  reset();
                }}
              >
                {selected.length ? "取消全选" : "全选可发布服务"}
              </Button>
            </div>
            <div className="publish-services">
              {services.map((service) => {
                const binding = environment?.bindings.find(
                    (b) => b.serviceId === service.id,
                  ),
                  disabled = reason(service),
                  checked = selected.includes(service.id);
                return (
                  <article
                    key={service.id}
                    className={`publish-service ${checked ? "selected" : ""}`}
                  >
                    <div className="publish-service-main">
                      <label className="checkbox">
                        <input
                          aria-label={`发布 ${service.name}`}
                          type="checkbox"
                          disabled={!!disabled || busy}
                          checked={checked}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, service.id]
                                : selected.filter((id) => id !== service.id),
                            );
                            reset();
                          }}
                        />
                        <span>
                          <strong>{service.name}</strong>
                          <small>{service.kind}</small>
                        </span>
                      </label>
                      <Badge tone={disabled ? "orange" : "gray"}>
                        {disabled || "已绑定"}
                      </Badge>
                    </div>
                    <div className="job-reference">
                      <Workflow size={14} />
                      <code>{binding?.job || "尚未配置任务"}</code>
                    </div>
                    <p className="muted small">
                      关联主机：
                      {environment?.servers
                        .filter((host) => binding?.serverIds?.includes(host.id))
                        .map((host) => `${host.name} (${host.host})`)
                        .join("、") || "未登记（Jenkins 仍使用 Job 自身配置）"}
                    </p>
                    {binding?.job && (
                      <div className="publish-service-options">
                        {binding.supportsBranch ? (
                          <Field
                            label={`发布分支 · ${service.name}`}
                            hint={`参数：${binding.branchParameter}`}
                          >
                            <select
                              disabled={!checked || busy}
                              value={
                                branches[service.id] || binding.defaultBranch
                              }
                              onChange={(e) => {
                                setBranches({
                                  ...branches,
                                  [service.id]: e.target.value,
                                });
                                reset();
                              }}
                            >
                              {binding.branches.map((b) => (
                                <option key={b}>{b}</option>
                              ))}
                            </select>
                          </Field>
                        ) : (
                          <span className="inline muted small">
                            <GitBranch size={14} />
                            使用 Job 自身配置
                          </span>
                        )}
                        <div className="fixed-parameters">
                          <span className="muted small">固定参数</span>
                          <pre>{binding.parameters || "无额外参数"}</pre>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {!services.length && (
              <Empty
                title="项目尚未维护服务"
                detail="请先添加服务，再为目标环境绑定 Jenkins Job。"
              />
            )}
            {mergeError && <div className="error-message">{mergeError}</div>}
            {merging && <p className="muted small">正在合并版本资料…</p>}
            {merge && (
              <VersionResources
                merge={merge}
                disabled={busy || merging}
                onResolve={(key, id) => {
                  setResolutions((old) => {
                    const next = { ...old };
                    if (id) next[key] = id;
                    else delete next[key];
                    return next;
                  });
                  reset();
                }}
              />
            )}
            {plan && (
              <section className="plan-confirmation">
                <h3>发布预览已生成</h3>
                <p>
                  {plan.environmentName} · {plan.versionName || "独立发布"} ·{" "}
                  {plan.services.length} 个任务
                </p>
                {plan.services.map((s: ServiceBuild) => (
                  <div key={s.serviceId}>
                    <strong>{s.name}</strong>
                    <code>
                      {s.jenkinsName} / {s.job}
                    </code>
                    <pre>{s.parameters || "无额外参数"}</pre>
                  </div>
                ))}
                <p>
                  确认下方任务和参数后，点击“确认触发 Jenkins”。预览 10
                  分钟内有效。
                </p>
              </section>
            )}
          </>
        ) : (
          <>
            <div className="publish-progress">
              <h3>{record.status}</h3>
              <span className="muted small">
                {record.environmentName} · {record.versionName || "独立发布"}
              </span>
            </div>
            {record.services.map((build) => (
              <BuildCard key={build.serviceId} build={build} />
            ))}
            {record.versionSnapshot && (
              <VersionResources merge={record.versionSnapshot} />
            )}
          </>
        )}
      </div>
      <div className="modal-footer">
        <span className="muted small">
          {record ? "状态来自 Jenkins" : "检查服务、分支与参数后发布"}
        </span>
        {!record && (
          <Button disabled={busy} onClick={onConfigure}>
            管理环境任务
          </Button>
        )}
        <Button onClick={onClose}>关闭</Button>
        {!record &&
          (plan ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void run()}
            >
              <Play size={15} />
              {busy ? "提交中…" : "确认触发 Jenkins"}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                busy ||
                merging ||
                !!mergeError ||
                !!merge?.unresolved ||
                !environment ||
                !selected.length
              }
              onClick={() => void preview()}
            >
              {busy ? "生成中…" : "生成发布预览"}
            </Button>
          ))}
      </div>
    </Modal>
  );
}
function BuildCard({ build }: { build: ServiceBuild }) {
  return (
    <article className="build-result-card">
      <div className="between">
        <h3>{build.name}</h3>
        <Badge>{build.status}</Badge>
      </div>
      <p className="muted small">
        {build.job}
        {build.buildNumber ? ` #${build.buildNumber}` : ""}
      </p>
      <p>
        <GitBranch size={14} /> {build.branch || "使用 Job 自身配置"}
      </p>
      {!!build.servers?.length && (
        <p className="muted small">
          主机快照：{build.servers.map((host) => host.host).join("、")}
        </p>
      )}
      <pre className="build-log-summary">{build.log || "等待任务处理…"}</pre>
      {build.consoleUrl && (
        <a
          className="text-button"
          href={build.consoleUrl}
          target="_blank"
          rel="noreferrer"
        >
          打开 Jenkins 控制台
        </a>
      )}
    </article>
  );
}
export function DeploymentDetail({
  record,
  onClose,
}: {
  record: Deployment;
  environmentName?: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(record),
    [selected, setSelected] = useState(record.services[0]?.serviceId || ""),
    [error, setError] = useState(""),
    [log, setLog] = useState("");
  const build = current.services.find((s) => s.serviceId === selected);
  useEffect(() => {
    const timer = setInterval(
      () =>
        void api<Deployment>(`/deployments/${record.id}`)
          .then(setCurrent)
          .catch((e) => setError(e.message)),
      2500,
    );
    return () => clearInterval(timer);
  }, [record.id]);
  return (
    <Modal
      title="部署详情"
      subtitle={`${current.id} · ${current.environmentName || ""} · ${current.versionName || "独立发布"}`}
      wide
      onClose={onClose}
    >
      <div className="deployment-detail-header">
        <Badge>{current.status}</Badge>
        <span>{new Date(current.started).toLocaleString("zh-CN")}</span>
        <span>{current.duration}</span>
        <span>{current.actor}</span>
      </div>
      {error && <div className="error-message">{error}</div>}
      {current.versionSnapshot && (
        <VersionResources merge={current.versionSnapshot} />
      )}
      <div className="execution-detail">
        <aside>
          {current.services.map((s) => (
            <button
              key={s.serviceId}
              className={selected === s.serviceId ? "selected" : ""}
              onClick={() => {
                setSelected(s.serviceId);
                setLog("");
              }}
            >
              <Workflow size={16} />
              <span>
                {s.name}
                <small>
                  {s.status} {s.buildNumber ? `#${s.buildNumber}` : ""}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <div className="execution-log">
          {build && (
            <>
              <div className="between">
                <span>
                  {build.job} · {build.branch || "Job 自身配置"}
                </span>
                <Badge>{build.status}</Badge>
              </div>
              <pre>{log || build.log || "等待 Jenkins 状态…"}</pre>
              {build.consoleUrl && (
                <a
                  className="text-button"
                  href={build.consoleUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开 Jenkins 控制台
                </a>
              )}
            </>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <Button
          onClick={() =>
            void post<Deployment>(`/deployments/${record.id}/refresh`)
              .then(setCurrent)
              .catch((e) => setError(e.message))
          }
        >
          <RefreshCw size={14} />
          重新查询结果
        </Button>
        <Button
          disabled={!build?.buildUrl}
          onClick={() =>
            void api(`/deployments/${record.id}/logs?serviceId=${selected}`)
              .then((data) => setLog(data.log))
              .catch((e) => setError(e.message))
          }
        >
          读取最新日志
        </Button>
        <Button onClick={onClose}>关闭</Button>
      </div>
    </Modal>
  );
}
