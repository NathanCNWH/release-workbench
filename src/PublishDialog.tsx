import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  GitBranch,
  LoaderCircle,
  Play,
  Workflow,
} from "lucide-react";
import type {
  Deployment,
  Environment,
  JenkinsProfile,
  Service,
  ServiceBuild,
} from "./types";
import { Badge, Button, Empty, Field, Modal, Note } from "./ui";

const phases = [
  "提交 Jenkins 队列",
  "等待构建开始",
  "Jenkins 构建中",
  "构建结果已返回",
];

export default function PublishDialog({
  projectId,
  projectName,
  environments,
  initialEnvironmentId,
  services,
  profiles,
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
  onComplete: (record: Deployment) => void;
  onClose: () => void;
  onConfigure: () => void;
}) {
  const [environmentId, setEnvironmentId] = useState(
    initialEnvironmentId || environments[0]?.id || "",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [branches, setBranches] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [phase, setPhase] = useState(0);
  const [failOne, setFailOne] = useState(false);
  const [builds, setBuilds] = useState<ServiceBuild[]>([]);
  const completion = useRef(onComplete);
  completion.current = onComplete;
  const environment = environments.find((e) => e.id === environmentId);
  const callbackDone = useRef(false);
  useEffect(() => {
    if (state !== "running") return;
    const timer = setTimeout(() => {
      if (phase < phases.length - 1) setPhase(phase + 1);
      else if (!callbackDone.current) {
        callbackDone.current = true;
        setState("done");
        const failures = builds.filter((b) => b.status === "失败").length;
        completion.current({
          id: `DEMO-${Date.now()}`,
          projectId,
          environmentId,
          status:
            failures === builds.length
              ? "失败"
              : failures
                ? "部分失败"
                : "成功",
          started: new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Shanghai",
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date()),
          duration: "构建演示",
          actor: "页面演示",
          services: builds,
          steps: builds.map((b) => ({
            name: b.name,
            detail: `${b.job} #${b.buildNumber}`,
            state: b.status,
          })),
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [state, phase, builds, projectId, environmentId]);

  function start() {
    if (!environment || !selected.length) return;
    const snapshots = services
      .filter((s) => selected.includes(s.id))
      .map((service, index): ServiceBuild => {
        const binding = environment.bindings.find(
          (b) => b.serviceId === service.id,
        )!;
        const profile = profiles.find(
          (p) =>
            p.id === (service.kind === "前端应用" ? "frontend" : "backend"),
        )!;
        const failed = failOne && index === 0;
        const buildNumber = 201 + index;
        const branch = binding.supportsBranch
          ? branches[service.id] || binding.defaultBranch
          : "";
        const consoleUrl = `${profile.url.replace(/\/$/, "")}/${binding.job
          .split("/")
          .map((segment) => `job/${encodeURIComponent(segment.trim())}`)
          .join("/")}/${buildNumber}/console`;
        return {
          serviceId: service.id,
          name: service.name,
          job: binding.job,
          jenkinsName: profile.name,
          jenkinsUrl: profile.url,
          branch,
          branchParameter: binding.supportsBranch
            ? binding.branchParameter
            : "",
          parameters: binding.parameters,
          status: failed ? "失败" : "成功",
          buildNumber,
          consoleUrl,
          log: `[页面演示，未调用真实 Jenkins]\nJob: ${binding.job}\n${branch ? `${binding.branchParameter}=${branch}` : "分支：使用 Job 自身配置"}\n${binding.parameters || "无额外参数"}\n\n已提交队列 → 构建开始 → 等待结果\n${failed ? "Finished: FAILURE\n示例原因：Jenkins 构建步骤返回非零退出码；请查看该 Job 的控制台。" : "Finished: SUCCESS\n示例构建成功。部署效果以实际 Job 的实现和日志为准。"}`,
        };
      });
    setBuilds(snapshots);
    setPhase(0);
    setState("running");
  }

  return (
    <Modal
      title="发布服务"
      subtitle={`${projectName} · 选择环境和服务，触发已有 Jenkins Job`}
      wide
      onClose={onClose}
    >
      <div className="modal-body publish-body">
        <Note tone="warm">
          前端交互演示，不会调用真实 Jenkins。工具仅触发 Job；SQL
          和配置均由人工处理。
        </Note>
        {state === "idle" ? (
          <>
            <div className="publish-target">
              <span className="number-chip">01</span>
              <Field label="选择环境">
                <select
                  value={environmentId}
                  onChange={(e) => {
                    setEnvironmentId(e.target.value);
                    setSelected([]);
                    setBranches({});
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
                  ? `${environment.servers.length} 台服务器 · ${environment.deployPath}`
                  : "项目尚未创建环境"}
              </span>
            </div>
            <div className="between publish-service-heading">
              <div className="inline">
                <span className="number-chip">02</span>
                <h3>
                  选择发布服务{" "}
                  <span className="muted small">已选 {selected.length} 项</span>
                </h3>
              </div>
              <Button
                onClick={() => {
                  const enabled = services
                    .filter((s) => {
                      const b = environment?.bindings.find(
                        (b) => b.serviceId === s.id,
                      );
                      const p = profiles.find(
                        (p) =>
                          p.id ===
                          (s.kind === "前端应用" ? "frontend" : "backend"),
                      );
                      return (
                        !!b?.job.trim() &&
                        !!p?.url &&
                        !!p?.username &&
                        p.credentialConfigured &&
                        (!b.supportsBranch ||
                          (!!b.branchParameter.trim() &&
                            b.branches.includes(b.defaultBranch)))
                      );
                    })
                    .map((s) => s.id);
                  setSelected(
                    selected.length === enabled.length ? [] : enabled,
                  );
                }}
              >
                {selected.length ? "取消全选" : "全选可发布服务"}
              </Button>
            </div>
            <div className="publish-services">
              {services.map((service) => {
                const binding = environment?.bindings.find(
                  (b) => b.serviceId === service.id,
                );
                const profile = profiles.find(
                  (p) =>
                    p.id ===
                    (service.kind === "前端应用" ? "frontend" : "backend"),
                );
                const reason = !binding?.job.trim()
                  ? "当前环境未绑定 Job"
                  : !profile?.url ||
                      !profile.username ||
                      !profile.credentialConfigured
                    ? "全局 Jenkins 配置不完整"
                    : binding.supportsBranch &&
                        (!binding.branchParameter.trim() ||
                          !binding.branches.includes(binding.defaultBranch))
                      ? "分支参数配置不完整"
                      : "";
                const checked = selected.includes(service.id);
                return (
                  <article
                    key={service.id}
                    className={`publish-service ${checked ? "selected" : ""} ${reason ? "unbound" : ""}`}
                  >
                    <div className="publish-service-main">
                      <label className="checkbox">
                        <input
                          aria-label={`发布 ${service.name}`}
                          type="checkbox"
                          checked={checked}
                          disabled={!!reason}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, service.id]
                                : selected.filter((id) => id !== service.id),
                            )
                          }
                        />
                        <span>
                          <strong>{service.name}</strong>
                          <small>
                            {service.kind} · {profile?.name}
                          </small>
                        </span>
                      </label>
                      <Badge tone={reason ? "orange" : "gray"}>
                        {reason || "已绑定"}
                      </Badge>
                    </div>
                    <div className="job-reference">
                      <Workflow size={14} />
                      <code>{binding?.job || "尚未配置任务"}</code>
                    </div>
                    {binding?.job && (
                      <div className="publish-service-options">
                        {binding.supportsBranch ? (
                          <Field
                            label={`发布分支 · ${service.name}`}
                            hint={`Jenkins 参数：${binding.branchParameter}`}
                          >
                            <select
                              disabled={!checked}
                              value={
                                branches[service.id] || binding.defaultBranch
                              }
                              onChange={(e) =>
                                setBranches({
                                  ...branches,
                                  [service.id]: e.target.value,
                                })
                              }
                            >
                              {binding.branches.map((branch) => (
                                <option key={branch}>{branch}</option>
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
                detail="先添加服务及 Git，再为目标环境绑定 Jenkins Job。"
              />
            )}
            <div className="publish-demo-options">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={failOne}
                  onChange={(e) => setFailOne(e.target.checked)}
                />
                <span>演示一个服务构建失败</span>
              </label>
              <span className="muted small">
                分支选项为示例，暂未读取真实 Job。
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="publish-progress">
              <span className="number-chip">
                {state === "done" ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <LoaderCircle className="spin" size={20} />
                )}
              </span>
              <div>
                <h3>{state === "done" ? "构建结果演示完成" : phases[phase]}</h3>
                <p>
                  {environment?.name} · {builds.length} 个服务 ·{" "}
                  {state === "done"
                    ? "已写入示例部署记录"
                    : "等待构建结果后才标记成功或失败"}
                </p>
              </div>
            </div>
            {builds.map((build) => (
              <div className="build-result-card" key={build.serviceId}>
                <div className="between">
                  <h3>{build.name}</h3>
                  {state === "done" ? (
                    <Badge>{build.status}</Badge>
                  ) : (
                    <Badge tone="blue">{phases[phase]}</Badge>
                  )}
                </div>
                <p className="muted small">
                  {build.job} {phase > 0 && `#${build.buildNumber}`}
                </p>
                <div className="inline small">
                  <GitBranch size={14} />
                  {build.branch || "使用 Job 自身配置"}
                </div>
                {state === "done" && (
                  <>
                    <pre className="build-log-summary">{build.log}</pre>
                    <span className="muted small">示例控制台地址</span>
                    <code className="console-url">{build.consoleUrl}</code>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="modal-footer">
        <span className="muted small">只触发选中的 Jenkins Job</span>
        {state === "idle" && (
          <Button onClick={onConfigure}>管理环境任务</Button>
        )}
        <Button onClick={onClose}>
          {state === "running" ? "结束演示" : "关闭"}
        </Button>
        {state === "idle" && (
          <Button
            variant="primary"
            disabled={!environment || !selected.length}
            onClick={start}
          >
            <Play size={15} />
            演示发布 {selected.length || ""} {selected.length ? "个服务" : ""}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function DeploymentDetail({
  record,
  environmentName,
  onClose,
}: {
  record: Deployment;
  environmentName: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(record.services[0]?.serviceId || "");
  const build = record.services.find((b) => b.serviceId === selected);
  return (
    <Modal
      title={`部署详情 · ${record.id}`}
      subtitle={`${environmentName} · 示例构建记录`}
      wide
      onClose={onClose}
    >
      <div className="deployment-detail-header">
        <Badge>{record.status}</Badge>
        <span>{record.started}</span>
        <span>{record.actor}</span>
        <span>{record.services.length} 个服务</span>
      </div>
      <div className="execution-detail">
        <aside>
          {record.services.map((b) => (
            <button
              className={selected === b.serviceId ? "selected" : ""}
              key={b.serviceId}
              onClick={() => setSelected(b.serviceId)}
            >
              <Workflow size={17} />
              <span>
                {b.name}
                <small>
                  {b.status} · #{b.buildNumber}
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
                  {build.jenkinsName} · {build.job}
                </span>
                <Badge>{build.status}</Badge>
              </div>
              <pre>{build.log}</pre>
              <span className="muted small">
                示例控制台地址（未连接真实 Jenkins）
              </span>
              <code className="console-url">{build.consoleUrl}</code>
            </>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <span className="muted small">保留本次 Job、分支、参数及构建结果</span>
        <Button onClick={onClose}>关闭</Button>
      </div>
    </Modal>
  );
}
