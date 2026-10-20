import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  Database,
  FileCode2,
  FileText,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  HardDrive,
  History,
  Info,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Package,
  Play,
  Plus,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SquareTerminal,
  X,
  XCircle,
} from "lucide-react";
import {
  projects as initialProjects,
  releases as initialReleases,
  environments as initialEnvironments,
  deployments as initialDeployments,
  backups as initialBackups,
  nextVersion,
  planSteps,
} from "./data";
import type {
  Backup,
  ConfigFile,
  Deployment,
  Environment,
  Page,
  Project,
  Release,
  SqlScript,
  Component,
} from "./types";
import {
  Badge,
  Button,
  CodeView,
  DiffView,
  Empty,
  Field,
  Modal,
  Note,
  SectionHeading,
  downloadText,
} from "./ui";
import EnvironmentEditor from "./EnvironmentEditor";

type Dialog =
  | "project"
  | "version"
  | "sql"
  | "config"
  | "component"
  | "environment"
  | "deploy"
  | "deployment-detail"
  | "backup-detail"
  | "help"
  | "integration"
  | null;
const navigation = [
  { id: "overview", title: "项目概览", icon: LayoutDashboard },
  { id: "projects", title: "全部项目", icon: FolderGit2 },
  { id: "versions", title: "版本管理", icon: Layers3 },
  { id: "environments", title: "环境连接", icon: Server },
  { id: "deployments", title: "部署记录", icon: History },
  { id: "backups", title: "备份管理", icon: HardDrive },
  { id: "ai", title: "外部 AI 接入", icon: Braces },
] as const;
const releaseTabs = [
  { id: "summary", label: "变更概览", icon: Blocks },
  { id: "sql", label: "数据库脚本", icon: Database },
  { id: "configs", label: "配置文件", icon: FileText },
  { id: "components", label: "组件仓库", icon: GitBranch },
  { id: "steps", label: "部署步骤", icon: ListChecks },
  { id: "history", label: "发布记录", icon: History },
];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const text = (data: FormData, key: string) =>
  String(data.get(key) || "").trim();
const stamp = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

export default function App() {
  const [projects, setProjects] = useState<Project[]>(clone(initialProjects));
  const [releases, setReleases] = useState<Release[]>(clone(initialReleases));
  const [environments, setEnvironments] = useState<Environment[]>(
    clone(initialEnvironments),
  );
  const [deployments, setDeployments] = useState<Deployment[]>(
    clone(initialDeployments),
  );
  const [page, setPage] = useState<Page>("overview");
  const [projectId, setProjectId] = useState("order");
  const [releaseId, setReleaseId] = useState("r3");
  const [environmentId, setEnvironmentId] = useState("test");
  const [versionOpen, setVersionOpen] = useState(false);
  const [releaseTab, setReleaseTab] = useState("summary");
  const [scriptId, setScriptId] = useState("s1");
  const [configId, setConfigId] = useState("c1");
  const [codeMode, setCodeMode] = useState("content");
  const [versionFilter, setVersionFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editingScript, setEditingScript] = useState<SqlScript | null>(null);
  const [editingConfig, setEditingConfig] = useState<ConfigFile | null>(null);
  const [editingComponent, setEditingComponent] = useState<Component | null>(
    null,
  );
  const [detailDeployment, setDetailDeployment] = useState<Deployment | null>(
    null,
  );
  const [detailBackup, setDetailBackup] = useState<Backup | null>(null);
  const [selectedStep, setSelectedStep] = useState(0);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoState, setDemoState] = useState<"idle" | "running" | "done">(
    "idle",
  );
  const [demoStep, setDemoStep] = useState(0);
  const [aiFormat, setAiFormat] = useState("Markdown");
  const [includeSql, setIncludeSql] = useState(true);
  const [includeConfigs, setIncludeConfigs] = useState(true);
  const [includeEnvironment, setIncludeEnvironment] = useState(true);
  const [recordFilter, setRecordFilter] = useState("全部");

  const project = projects.find((item) => item.id === projectId) || projects[0];
  const projectReleases = releases.filter(
    (item) => item.projectId === projectId,
  );
  const release =
    projectReleases.find((item) => item.id === releaseId) || projectReleases[0];
  const projectEnvironments = environments.filter(
    (item) => item.projectId === projectId,
  );
  const environment =
    projectEnvironments.find((item) => item.id === environmentId) ||
    projectEnvironments[0];
  const projectDeployments = deployments.filter(
    (item) => item.projectId === projectId,
  );
  const projectBackups = initialBackups.filter(
    (item) => item.projectId === projectId,
  );
  const script =
    release?.scripts.find((item) => item.id === scriptId) ||
    release?.scripts[0];
  const config =
    release?.configs.find((item) => item.id === configId) ||
    release?.configs[0];
  const notify = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (dialog !== "deploy" || demoState !== "running") return;
    const timer = setTimeout(() => {
      if (demoStep < planSteps.length - 1)
        setDemoStep((previous) => previous + 1);
      else {
        setDemoState("done");
        if (release && environment)
          setDeployments((previous) => [
            {
              id: `DEMO-${previous.length + 1}`,
              projectId,
              versionId: release.id,
              environmentId: environment.id,
              status: "成功",
              started: stamp(),
              duration: "流程演示",
              actor: "页面演示",
              steps: clone(planSteps),
            },
            ...previous,
          ]);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [dialog, demoState, demoStep, release, environment, projectId]);

  function navigate(destination: Page) {
    setPage(destination);
    setVersionOpen(false);
    setSearch("");
    setSidebarOpen(false);
    setQuery("");
  }
  function selectProject(id: string) {
    setProjectId(id);
    setReleaseId(releases.find((item) => item.projectId === id)?.id || "");
    setEnvironmentId(
      environments.find((item) => item.projectId === id)?.id || "",
    );
    setVersionOpen(false);
    setSearch("");
  }
  function openRelease(id: string, tab = "summary") {
    setReleaseId(id);
    setPage("versions");
    setVersionOpen(true);
    setReleaseTab(tab);
    setCodeMode("content");
    setSearch("");
  }
  function updateRelease(updater: (current: Release) => Release) {
    if (release)
      setReleases((previous) =>
        previous.map((item) => (item.id === release.id ? updater(item) : item)),
      );
  }
  function showDeployment(item: Deployment) {
    setDetailDeployment(item);
    setSelectedStep(item.status === "失败" ? 3 : 0);
    setDialog("deployment-detail");
  }
  function openDeploy(item?: Release) {
    if (item) setReleaseId(item.id);
    setDemoState("idle");
    setDemoStep(0);
    setDialog("deploy");
  }
  function closeDialog() {
    if (demoState === "running") {
      setDemoState("idle");
      notify("已结束流程演示，没有执行真实发布。");
    }
    setDialog(null);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("已复制到剪贴板。");
    } catch {
      notify("当前浏览器不允许复制，请使用导出按钮。");
    }
  }

  const context = useMemo(() => {
    if (!release) return "请先创建一个版本，再生成外部 AI 资料。";
    const data = {
      notice: "前端样稿的示例数据，仅供需求评审；不包含账号密码或 Token。",
      project: { name: project.name, key: project.key },
      release: {
        name: release.name,
        title: release.title,
        status: release.status,
      },
      components: release.components,
      ...(includeSql
        ? {
            sqlScripts: release.scripts.map((item) => ({
              name: item.name,
              database: item.database,
              order: item.order,
              content: item.sql,
            })),
          }
        : {}),
      ...(includeConfigs
        ? {
            configurations: release.configs.map((item) => ({
              name: item.name,
              path: item.path,
              content: item.content,
            })),
          }
        : {}),
      ...(includeEnvironment
        ? {
            environment: environment
              ? {
                  name: environment.name,
                  host: environment.host,
                  deployPath: environment.deployPath,
                  database: environment.database,
                  jenkinsJob: environment.job,
                  credentials: "[通过本地凭据引用获取，不导出秘密值]",
                }
              : null,
          }
        : {}),
    };
    if (aiFormat === "JSON") return JSON.stringify(data, null, 2);
    return `# ${project.name} · ${release.name}\n\n> 示例资料，仅供页面评审；不含账号密码和 Token。\n\n## 版本\n\n${release.title}\n状态：${release.status}\n\n## 代码组件\n\n${release.components.map((item) => `- ${item.name}：${item.branch} / ${item.commit}\n  产物：${item.artifact}`).join("\n")}\n${includeEnvironment && environment ? `\n## 目标环境\n\n- 环境：${environment.name}\n- 主机：${environment.host}\n- 发布路径：${environment.deployPath}\n- 数据库：${environment.database}\n- Jenkins Job：${environment.job}\n- 凭据：仅保留本地引用，未导出秘密\n` : ""}${includeSql ? `\n## 版本 SQL\n${release.scripts.map((item) => `\n### ${item.order}. ${item.name}\n\n逻辑数据库：${item.database}\n\n\`\`\`sql\n${item.sql}\n\`\`\`\n`).join("")}` : ""}${includeConfigs ? `\n## 配置文件\n${release.configs.map((item) => `\n### ${item.name}\n\n目标路径：${item.path}\n\n\`\`\`\n${item.content}\n\`\`\`\n`).join("")}` : ""}`;
  }, [
    release,
    project,
    environment,
    aiFormat,
    includeSql,
    includeConfigs,
    includeEnvironment,
  ]);

  function renderReleaseTable(items: Release[], compact = false) {
    return items.length ? (
      <div className="table-scroll">
        <table className={`data-table ${compact ? "compact" : ""}`}>
          <thead>
            <tr>
              <th>版本 / 发布内容</th>
              <th>状态</th>
              <th>变更资源</th>
              <th>更新时间</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <button
                    className="version-title"
                    onClick={() => openRelease(item.id)}
                  >
                    <span className="version-symbol">
                      <Package size={17} />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.title}</small>
                    </span>
                  </button>
                </td>
                <td>
                  <Badge>{item.status}</Badge>
                </td>
                <td>
                  <div className="resource-counts">
                    <span title="代码组件">
                      <GitBranch size={13} />
                      {item.components.length}
                    </span>
                    <span title="SQL 脚本">
                      <Database size={13} />
                      {item.scripts.length}
                    </span>
                    <span title="配置文件">
                      <FileText size={13} />
                      {item.configs.length}
                    </span>
                  </div>
                </td>
                <td className="muted table-time">
                  {item.created.slice(5)}
                  <small>{item.author}</small>
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => openRelease(item.id)}
                  >
                    查看版本
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title="还没有版本"
        detail="先创建版本，把代码、SQL 和配置变化放在一起。"
        action={
          <Button onClick={() => setDialog("version")}>
            <Plus size={15} />
            新建版本
          </Button>
        }
      />
    );
  }

  function renderDeploymentTable(items = projectDeployments) {
    const filtered = items.filter(
      (item) => recordFilter === "全部" || item.status === recordFilter,
    );
    return filtered.length ? (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>发布记录</th>
              <th>版本</th>
              <th>目标环境</th>
              <th>结果</th>
              <th>开始时间 / 耗时</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>
                  <button
                    className="text-button dark"
                    onClick={() => showDeployment(item)}
                  >
                    {item.id}
                  </button>
                  <small className="table-subtext">{item.actor}</small>
                </td>
                <td>
                  <code>
                    {releases.find((value) => value.id === item.versionId)
                      ?.name || "—"}
                  </code>
                </td>
                <td>
                  {environments.find((value) => value.id === item.environmentId)
                    ?.name || "—"}
                </td>
                <td>
                  <Badge>{item.status}</Badge>
                </td>
                <td className="table-time">
                  {item.started.slice(5)}
                  <small>{item.duration}</small>
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => showDeployment(item)}
                  >
                    查看详情
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="暂无部署记录" detail="发布记录会按版本和环境分别保留。" />
    );
  }

  function renderOverview() {
    const release =
      projectReleases.find((item) => item.status === "草稿") ||
      projectReleases[0];
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">PROJECT OVERVIEW</div>
            <h1>
              {project.name}
              <span className="subtle-tag">{project.key}</span>
            </h1>
            <p>让每次发布的代码、SQL 和配置变化，都有据可查。</p>
          </div>
          <div className="actions">
            <Button
              onClick={() => {
                navigate("environments");
              }}
            >
              <Settings2 size={16} />
              管理环境
            </Button>
            <Button variant="primary" onClick={() => setDialog("version")}>
              <Plus size={17} />
              新建版本
            </Button>
          </div>
        </div>
        <div className="summary-strip">
          <div>
            <span>项目版本</span>
            <strong>{String(projectReleases.length).padStart(2, "0")}</strong>
            <small>
              {projectReleases.filter((item) => item.status === "草稿").length}{" "}
              个草稿待完善
            </small>
          </div>
          <div>
            <span>发布环境</span>
            <strong>
              {String(projectEnvironments.length).padStart(2, "0")}
            </strong>
            <small>资源与连接独立维护</small>
          </div>
          <div>
            <span>数据库脚本</span>
            <strong>
              {String(
                projectReleases.reduce(
                  (sum, item) => sum + item.scripts.length,
                  0,
                ),
              ).padStart(2, "0")}
            </strong>
            <small>随版本保存每次变化</small>
          </div>
          <div>
            <span>最近发布</span>
            <strong className="status-stat">
              {projectDeployments[0] ? (
                projectDeployments[0].status === "失败" ? (
                  <>
                    <i className="status-dot red" />
                    需要关注
                  </>
                ) : (
                  <>
                    <i className="status-dot green" />
                    发布成功
                  </>
                )
              ) : (
                "暂无发布"
              )}
            </strong>
            <small>
              {projectDeployments[0]
                ? `${projectDeployments[0].id} · 示例记录`
                : "暂无发布"}
            </small>
          </div>
        </div>
        <div className="overview-layout">
          <div className="overview-main">
            <section className="panel">
              <SectionHeading
                title="环境发布情况"
                description="同一版本跨环境复用，发布状态分别记录"
                action={
                  <button
                    className="text-button"
                    onClick={() => navigate("environments")}
                  >
                    全部环境
                    <ArrowUpRight size={14} />
                  </button>
                }
              />
              <div className="environment-cards">
                {projectEnvironments.map((item) => (
                  <article className="environment-card" key={item.id}>
                    <div className="between">
                      <span
                        className={`env-label env-${item.type === "生产" ? "production" : "test"}`}
                      >
                        <span />
                        {item.name}
                      </span>
                      <span className="muted mono">{item.key}</span>
                    </div>
                    <p className="env-version-label">最后完整成功版本</p>
                    <button
                      className="env-version"
                      onClick={() => {
                        const found = releases.find(
                          (value) =>
                            value.projectId === projectId &&
                            value.name === item.currentVersion,
                        );
                        if (found) openRelease(found.id);
                      }}
                    >
                      {item.currentVersion || "尚未发布"}
                      <ArrowUpRight size={17} />
                    </button>
                    <div className="environment-card-meta">
                      <span>
                        <Server size={13} />
                        {item.host}
                      </span>
                      <span>
                        <Database size={13} />
                        {item.database}
                      </span>
                    </div>
                    <div className="environment-card-footer">
                      <span className="muted">
                        <Clock3 size={12} />
                        检查于 {item.checkedAt}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEnvironmentId(item.id);
                          navigate("environments");
                        }}
                      >
                        管理
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </article>
                ))}
                {!projectEnvironments.length && (
                  <Empty
                    title="还没有环境"
                    detail="添加 Linux、数据库和 Jenkins 连接。"
                    action={
                      <Button onClick={() => setDialog("environment")}>
                        新建环境
                      </Button>
                    }
                  />
                )}
              </div>
              {projectDeployments.find((item) => item.status === "失败") && (
                <div className="deployment-alert">
                  <span className="alert-icon">
                    <Info size={16} />
                  </span>
                  <div>
                    <strong>生产环境上次发布未完成</strong>
                    <p>停在配置文件更新，已执行步骤与备份可在记录中查看。</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      showDeployment(
                        projectDeployments.find(
                          (item) => item.status === "失败",
                        )!,
                      )
                    }
                  >
                    查看原因
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </section>
            <section className="panel">
              <SectionHeading
                title="最近版本"
                description="集中维护每次发布的完整变更"
                action={
                  <button
                    className="text-button"
                    onClick={() => navigate("versions")}
                  >
                    全部版本
                    <ArrowUpRight size={14} />
                  </button>
                }
              />
              {renderReleaseTable(projectReleases.slice(0, 3), true)}
            </section>
          </div>
          <aside className="overview-aside">
            <section className="panel next-release">
              <div className="eyebrow">NEXT RELEASE</div>
              <span className="next-icon">
                <Package size={24} />
              </span>
              <h2>{release?.name || "准备第一个版本"}</h2>
              <p>{release?.title || "从版本开始组织一次完整发布。"}</p>
              {release && <Badge>{release.status}</Badge>}
              <div className="next-resource-list">
                <button
                  onClick={() =>
                    release && openRelease(release.id, "components")
                  }
                >
                  <GitBranch size={16} />
                  <span>代码组件</span>
                  <b>{release?.components.length || 0}</b>
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => release && openRelease(release.id, "sql")}
                >
                  <Database size={16} />
                  <span>数据库脚本</span>
                  <b>{release?.scripts.length || 0}</b>
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => release && openRelease(release.id, "configs")}
                >
                  <FileText size={16} />
                  <span>配置文件</span>
                  <b>{release?.configs.length || 0}</b>
                  <ChevronRight size={13} />
                </button>
              </div>
              <Button
                variant="primary"
                className="full-width"
                onClick={() =>
                  release ? openRelease(release.id) : setDialog("version")
                }
              >
                {release ? "继续完善版本" : "新建版本"}
                <ArrowRight size={15} />
              </Button>
            </section>
            <div className="workflow-note">
              <ShieldCheck size={20} />
              <h3>一份版本，完整追溯</h3>
              <p>
                SQL、配置与代码提交固定到版本，环境只维护目标连接和发布路径。
              </p>
              <button className="text-button" onClick={() => setDialog("help")}>
                了解页面流程
                <ArrowUpRight size={13} />
              </button>
            </div>
          </aside>
        </div>
      </>
    );
  }

  function renderProjects() {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR WORKSPACE</div>
            <h1>
              全部项目<span className="heading-count">{projects.length}</span>
            </h1>
            <p>每个项目独立管理组件、环境与版本资源。</p>
          </div>
          <Button variant="primary" onClick={() => setDialog("project")}>
            <Plus size={17} />
            新建项目
          </Button>
        </div>
        <div className="project-grid">
          {projects
            .filter((item) => !query || (item.name + item.key).includes(query))
            .map((item) => (
              <article className="panel project-card" key={item.id}>
                <div className="between">
                  <span className={`project-avatar ${item.color}`}>
                    <FolderGit2 size={25} />
                  </span>
                  <Badge tone="green">使用中</Badge>
                </div>
                <h2>{item.name}</h2>
                <code>{item.key}</code>
                <p>{item.description}</p>
                <div className="project-numbers">
                  <span>
                    <b>
                      {
                        releases.filter((value) => value.projectId === item.id)
                          .length
                      }
                    </b>{" "}
                    个版本
                  </span>
                  <span>
                    <b>
                      {
                        environments.filter(
                          (value) => value.projectId === item.id,
                        ).length
                      }
                    </b>{" "}
                    个环境
                  </span>
                </div>
                <div className="between project-bottom">
                  <span className="muted">{item.updated}更新</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      selectProject(item.id);
                      navigate("overview");
                    }}
                  >
                    进入项目
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          <button
            className="new-project-card"
            onClick={() => setDialog("project")}
          >
            <span>
              <Plus size={24} />
            </span>
            <strong>新建一个项目</strong>
            <small>从项目开始组织你的发布</small>
          </button>
        </div>
      </>
    );
  }

  function renderVersions() {
    if (versionOpen && release) return renderReleaseDetail();
    const filtered = projectReleases.filter(
      (item) =>
        (versionFilter === "全部" || item.status === versionFilter) &&
        (!query || (item.name + item.title).includes(query)),
    );
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">RELEASES</div>
            <h1>版本管理</h1>
            <p>用一个版本串起代码、数据库脚本与配置更新。</p>
          </div>
          <Button variant="primary" onClick={() => setDialog("version")}>
            <Plus size={17} />
            新建版本
          </Button>
        </div>
        <section className="panel">
          <div className="list-toolbar">
            <div className="filter-tabs">
              {["全部", "草稿", "就绪", "已归档"].map((label) => (
                <button
                  key={label}
                  className={versionFilter === label ? "active" : ""}
                  onClick={() => setVersionFilter(label)}
                >
                  {label}
                  <span>
                    {
                      projectReleases.filter(
                        (item) => label === "全部" || item.status === label,
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <div className="search-input">
              <Search size={15} />
              <input
                aria-label="搜索版本"
                placeholder="搜索版本号、发布内容"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          {renderReleaseTable(filtered)}
          <div className="table-footer">
            共 {filtered.length} 个版本
            <span>默认命名：年月日 + 当日序号，例如 20261020-01</span>
          </div>
        </section>
        <Note>
          就绪版本固定发布内容。测试与生产复用同一版本，各环境的部署记录分别保留。
        </Note>
      </>
    );
  }

  function renderReleaseDetail() {
    if (!release) return null;
    const editable = release.status === "草稿";
    return (
      <>
        <button className="back-link" onClick={() => setVersionOpen(false)}>
          <ArrowLeft size={15} />
          返回版本列表
        </button>
        <div className="page-heading release-heading">
          <div>
            <div className="inline">
              <span className="release-large-icon">
                <Package size={26} />
              </span>
              <h1>{release.name}</h1>
              <Badge>{release.status}</Badge>
            </div>
            <p>{release.title}</p>
            <div className="release-meta">
              <span>
                <Clock3 size={13} />
                {release.created}
              </span>
              <span>创建人：{release.author}</span>
              <span>{project.name}</span>
            </div>
          </div>
          <div className="actions">
            <Button
              onClick={() => {
                downloadText(
                  `${release.name}-manifest.json`,
                  JSON.stringify(release, null, 2),
                  "application/json",
                );
                notify("已导出版本示例清单。");
              }}
            >
              <ArrowDownToLine size={15} />
              导出清单
            </Button>
            {editable ? (
              <Button
                onClick={() => {
                  updateRelease((value) => ({ ...value, status: "就绪" }));
                  notify("已在样稿中标记就绪，版本资源随之锁定。");
                }}
              >
                <Check size={15} />
                标记就绪
              </Button>
            ) : (
              <Button onClick={() => setDialog("version")}>
                <Copy size={15} />
                复制为新版本
              </Button>
            )}
            <Button
              variant="primary"
              disabled={release.status === "已归档"}
              onClick={() => openDeploy()}
            >
              <Play size={15} />
              预览发布
            </Button>
          </div>
        </div>
        <section className="panel release-panel">
          <div className="tabs release-tabs">
            {releaseTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setReleaseTab(tab.id);
                  setCodeMode("content");
                }}
                className={releaseTab === tab.id ? "active" : ""}
              >
                <tab.icon size={15} />
                {tab.label}
                {["sql", "configs", "components"].includes(tab.id) && (
                  <span className="tab-count">
                    {tab.id === "sql"
                      ? release.scripts.length
                      : tab.id === "configs"
                        ? release.configs.length
                        : release.components.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {releaseTab === "summary" && (
            <div className="release-summary">
              <div className="release-summary-main">
                <h3>本次发布内容</h3>
                <p className="muted">
                  {release.title}，以下资源随版本一起保存。
                </p>
                <div className="change-cards">
                  <button onClick={() => setReleaseTab("components")}>
                    <span className="change-icon blue">
                      <GitBranch size={20} />
                    </span>
                    <div>
                      <strong>{release.components.length} 个代码组件</strong>
                      <small>分支、固定提交与构建产物</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                  <button onClick={() => setReleaseTab("sql")}>
                    <span className="change-icon green">
                      <Database size={20} />
                    </span>
                    <div>
                      <strong>{release.scripts.length} 个数据库脚本</strong>
                      <small>按版本维护 SQL 变化与执行顺序</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                  <button onClick={() => setReleaseTab("configs")}>
                    <span className="change-icon orange">
                      <FileText size={20} />
                    </span>
                    <div>
                      <strong>{release.configs.length} 个配置文件</strong>
                      <small>保存内容、目标路径和前后差异</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="summary-files">
                  <div className="between">
                    <h3>数据库变化</h3>
                    <button
                      className="text-button"
                      onClick={() => setReleaseTab("sql")}
                    >
                      维护脚本
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  {release.scripts.length ? (
                    release.scripts.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setReleaseTab("sql");
                          setScriptId(item.id);
                        }}
                      >
                        <span className="order-number">
                          {String(item.order).padStart(2, "0")}
                        </span>
                        <FileCode2 size={16} />
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.description}</small>
                        </div>
                        <Badge>{item.kind}</Badge>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p className="muted">本版本尚未添加 SQL 脚本。</p>
                  )}
                </div>
              </div>
              <aside className="release-summary-aside">
                <h3>发布检查</h3>
                <div className="release-checks">
                  <span>
                    <CheckCircle2 size={15} />
                    代码提交已固定
                  </span>
                  <span>
                    <CheckCircle2 size={15} />
                    资源副本随版本保存
                  </span>
                  <span>
                    <CheckCircle2 size={15} />
                    配置秘密使用变量引用
                  </span>
                  <span className={editable ? "muted" : ""}>
                    {editable ? (
                      <Clock3 size={15} />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    {editable ? "草稿待标记就绪" : "版本已就绪"}
                  </span>
                </div>
                <div className="info-divider" />
                <h3>可发布到</h3>
                {projectEnvironments.map((item) => (
                  <div key={item.id} className="ready-environment">
                    <span
                      className={`env-dot ${item.type === "生产" ? "orange" : "blue"}`}
                    />
                    {item.name}
                    <code>{item.currentVersion || "未发布"}</code>
                  </div>
                ))}
                <p className="small muted">
                  当前显示示例检查项。真实资源与连接检查将在后端开发后提供。
                </p>
              </aside>
            </div>
          )}
          {releaseTab === "sql" && (
            <>
              <div className="resource-toolbar">
                <div>
                  <h3>
                    版本数据库脚本
                    <span className="heading-count">
                      {release.scripts.length}
                    </span>
                  </h3>
                  <p>管理本版本的增量 SQL、目标库与变化内容。</p>
                </div>
                <Button
                  disabled={!editable}
                  onClick={() => {
                    setEditingScript(null);
                    setDialog("sql");
                  }}
                >
                  <Plus size={15} />
                  添加脚本
                </Button>
              </div>
              {release.scripts.length && script ? (
                <div className="resource-workspace">
                  <aside className="file-list">
                    <div className="file-list-heading">
                      执行顺序 · {release.scripts.length} 个文件
                    </div>
                    {release.scripts
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setScriptId(item.id)}
                          className={item.id === script.id ? "selected" : ""}
                        >
                          <span className="file-order">
                            {String(item.order).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>{item.name}</strong>
                            <small>
                              <Database size={11} />
                              {item.database}
                              <span
                                className={
                                  item.kind === "新增"
                                    ? "text-green"
                                    : "text-blue"
                                }
                              >
                                {item.kind}
                              </span>
                            </small>
                          </div>
                        </button>
                      ))}
                    <div className="file-list-foot">
                      <Info size={13} />
                      脚本与版本一起保存
                    </div>
                  </aside>
                  <div className="code-panel">
                    <div className="code-toolbar">
                      <span>
                        <FileCode2 size={15} />
                        <strong>{script.name}</strong>
                        <Badge>{script.kind}</Badge>
                      </span>
                      <div className="actions">
                        <div className="segmented">
                          <button
                            onClick={() => setCodeMode("content")}
                            className={codeMode === "content" ? "active" : ""}
                          >
                            脚本内容
                          </button>
                          <button
                            onClick={() => setCodeMode("diff")}
                            className={codeMode === "diff" ? "active" : ""}
                          >
                            变化对比
                          </button>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="复制脚本"
                          onClick={() => copy(script.sql)}
                        >
                          <Copy size={15} />
                        </button>
                        <Button
                          disabled={!editable}
                          onClick={() => {
                            setEditingScript(script);
                            setDialog("sql");
                          }}
                        >
                          编辑脚本
                        </Button>
                      </div>
                    </div>
                    <div className="script-description">
                      <Info size={14} />
                      {script.description}
                    </div>
                    {codeMode === "content" ? (
                      <CodeView content={script.sql} label="SQL 脚本内容" />
                    ) : (
                      <DiffView
                        before={script.previousSql}
                        after={script.sql}
                      />
                    )}
                    <div className="code-footer">
                      <span>MySQL · UTF-8</span>
                      <span>
                        逻辑数据库 <code>{script.database}</code> · 顺序{" "}
                        {script.order}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <Empty
                  title="还没有数据库脚本"
                  detail="添加本版本需要执行的 SQL 文件，保留每次脚本变化。"
                  action={
                    <Button
                      disabled={!editable}
                      onClick={() => {
                        setEditingScript(null);
                        setDialog("sql");
                      }}
                    >
                      <Plus size={15} />
                      添加脚本
                    </Button>
                  }
                />
              )}
            </>
          )}
          {releaseTab === "configs" && (
            <>
              <div className="resource-toolbar">
                <div>
                  <h3>
                    本地配置文件
                    <span className="heading-count">
                      {release.configs.length}
                    </span>
                  </h3>
                  <p>文件内容固定到版本，目标路径按环境解析。</p>
                </div>
                <Button
                  disabled={!editable}
                  onClick={() => {
                    setEditingConfig(null);
                    setDialog("config");
                  }}
                >
                  <Plus size={15} />
                  添加配置
                </Button>
              </div>
              {release.configs.length && config ? (
                <div className="resource-workspace">
                  <aside className="file-list">
                    <div className="file-list-heading">版本配置</div>
                    {release.configs.map((item) => (
                      <button
                        key={item.id}
                        className={item.id === config.id ? "selected" : ""}
                        onClick={() => setConfigId(item.id)}
                      >
                        <FileText size={17} />
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.format} · 本地文件</small>
                        </div>
                      </button>
                    ))}
                    <div className="file-list-foot">
                      <LockKeyhole size={13} />
                      秘密通过变量引用
                    </div>
                  </aside>
                  <div className="code-panel">
                    <div className="code-toolbar">
                      <span>
                        <FileText size={15} />
                        <strong>{config.name}</strong>
                      </span>
                      <div className="actions">
                        <div className="segmented">
                          <button
                            className={codeMode === "content" ? "active" : ""}
                            onClick={() => setCodeMode("content")}
                          >
                            文件内容
                          </button>
                          <button
                            className={codeMode === "diff" ? "active" : ""}
                            onClick={() => setCodeMode("diff")}
                          >
                            变化对比
                          </button>
                        </div>
                        <Button
                          disabled={!editable}
                          onClick={() => {
                            setEditingConfig(config);
                            setDialog("config");
                          }}
                        >
                          编辑配置
                        </Button>
                      </div>
                    </div>
                    <div className="script-description">
                      <FolderGit2 size={14} />
                      目标路径：<code>{config.path}</code>
                    </div>
                    {codeMode === "content" ? (
                      <CodeView content={config.content} label="配置文件内容" />
                    ) : (
                      <DiffView
                        before={config.previousContent}
                        after={config.content}
                      />
                    )}
                    <div className="code-footer">
                      <span>{config.format} · UTF-8</span>
                      <span>后续可配置 Nacos 映射，当前不自动同步</span>
                    </div>
                  </div>
                </div>
              ) : (
                <Empty
                  title="还没有配置文件"
                  detail="选择需要随版本发布的本地文本配置。"
                  action={
                    <Button
                      disabled={!editable}
                      onClick={() => {
                        setEditingConfig(null);
                        setDialog("config");
                      }}
                    >
                      添加配置
                    </Button>
                  }
                />
              )}
            </>
          )}
          {releaseTab === "components" && (
            <div className="component-section">
              <SectionHeading
                title="组件与固定提交"
                description="每个组件分别维护仓库、分支、提交和构建产物。"
                action={
                  <Button
                    disabled={!editable}
                    onClick={() => {
                      setEditingComponent(null);
                      setDialog("component");
                    }}
                  >
                    <Plus size={15} />
                    添加组件
                  </Button>
                }
              />
              {release.components.length ? (
                release.components.map((item) => (
                  <article className="component-card" key={item.id}>
                    <div className="between">
                      <div className="inline">
                        <span className="component-icon">
                          <Code2 size={20} />
                        </span>
                        <div>
                          <h3>{item.name}</h3>
                          <span className="muted small">{item.kind}</span>
                        </div>
                      </div>
                      <Button
                        disabled={!editable}
                        onClick={() => {
                          setEditingComponent(item);
                          setDialog("component");
                        }}
                      >
                        编辑
                      </Button>
                    </div>
                    <div className="component-details">
                      <div>
                        <span>Git 仓库</span>
                        <code>{item.repository}</code>
                      </div>
                      <div>
                        <span>来源分支</span>
                        <code>
                          <GitBranch size={13} />
                          {item.branch}
                        </code>
                      </div>
                      <div>
                        <span>固定提交</span>
                        <code>
                          <GitCommitHorizontal size={13} />
                          {item.commit}
                        </code>
                      </div>
                      <div>
                        <span>构建产物</span>
                        <code>
                          <Package size={13} />
                          {item.artifact}
                        </code>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="还没有代码组件"
                  detail="添加后端、前端或其他需要发布的组件。"
                />
              )}
              <Note>
                分支用于标识来源，发布时使用版本固定的提交或产物。环境不改变版本内容。
              </Note>
            </div>
          )}
          {releaseTab === "steps" && (
            <div className="steps-section">
              <SectionHeading
                title="发布步骤"
                description="先预览影响范围，再按项目定义的顺序发布。"
                action={
                  <Button onClick={() => openDeploy()}>
                    <Play size={14} />
                    预览发布
                  </Button>
                }
              />
              {planSteps.map((item, index) => (
                <div className="template-step" key={item.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <Badge tone="gray">
                    {index < 2
                      ? "前置准备"
                      : index === 5
                        ? "结果验证"
                        : "变更执行"}
                  </Badge>
                </div>
              ))}
              <Note>
                当前展示默认流程。步骤编排、超时与失败处理将在页面确认后的业务开发阶段实现。
              </Note>
            </div>
          )}
          {releaseTab === "history" && (
            <>
              {renderDeploymentTable(
                projectDeployments.filter(
                  (item) => item.versionId === release.id,
                ),
              )}
            </>
          )}
        </section>
        {!editable && (
          <Note>
            <LockKeyhole size={14} />
            就绪或归档版本的资源已锁定。需要修改时，请复制为新的草稿版本。
          </Note>
        )}
      </>
    );
  }

  function renderEnvironments() {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">ENVIRONMENTS & CONNECTIONS</div>
            <h1>环境连接</h1>
            <p>维护服务器、数据库与 Jenkins 账号，配置每个环境的发布路径。</p>
          </div>
          <Button variant="primary" onClick={() => setDialog("environment")}>
            <Plus size={16} />
            新建环境
          </Button>
        </div>
        {!environment ? (
          <section className="panel">
            <Empty
              title="为项目添加第一个环境"
              detail="环境可以分别绑定 Linux 服务器、MySQL 和 Jenkins。"
              action={
                <Button onClick={() => setDialog("environment")}>
                  新建环境
                </Button>
              }
            />
          </section>
        ) : (
          <div className="environment-layout">
            <aside className="environment-selector">
              {projectEnvironments.map((item) => (
                <button
                  className={item.id === environment.id ? "selected" : ""}
                  key={item.id}
                  onClick={() => setEnvironmentId(item.id)}
                >
                  <span
                    className={`env-dot ${item.type === "生产" ? "orange" : "blue"}`}
                  />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.key} · {item.host}
                    </small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
              <div className="connection-tip">
                <ShieldCheck size={20} />
                <h3>按环境维护</h3>
                <p>项目版本可以复用，连接、凭据和路径始终属于目标环境。</p>
              </div>
            </aside>
            <EnvironmentEditor
              key={environment.id}
              environment={environment}
              onSave={(value) => {
                setEnvironments((previous) =>
                  previous.map((item) => (item.id === value.id ? value : item)),
                );
                notify("页面配置已更新。样稿仅保留在内存，刷新后重置。");
              }}
              notify={notify}
            />
          </div>
        )}
      </>
    );
  }

  function renderDeployments() {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">DEPLOYMENT HISTORY</div>
            <h1>部署记录</h1>
            <p>每一次发布独立记录，保留步骤、备份与最终结果。</p>
          </div>
          <Button
            variant="primary"
            disabled={!release}
            onClick={() => openDeploy()}
          >
            <Play size={15} />
            预览发布
          </Button>
        </div>
        <section className="panel">
          <div className="list-toolbar">
            <div className="filter-tabs">
              {["全部", "成功", "失败"].map((label) => (
                <button
                  key={label}
                  className={recordFilter === label ? "active" : ""}
                  onClick={() => setRecordFilter(label)}
                >
                  {label}
                  <span>
                    {
                      projectDeployments.filter(
                        (item) => label === "全部" || item.status === label,
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <span className="muted inline small">
              <Info size={14} />
              以下为示例与流程演示记录
            </span>
          </div>
          {renderDeploymentTable()}
          <div className="table-footer">
            共 {projectDeployments.length} 条记录
            <span>状态未知与失败将分别记录</span>
          </div>
        </section>
      </>
    );
  }

  function renderBackups() {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">BACKUPS & RECOVERY MATERIALS</div>
            <h1>备份管理</h1>
            <p>将数据库和配置备份，与来源环境、版本和发布关联。</p>
          </div>
          <Button
            onClick={() =>
              notify("前端样稿不创建真实备份。后端完成后可按环境发起备份。")
            }
          >
            <Plus size={16} />
            创建备份（演示）
          </Button>
        </div>
        <div className="backup-summary">
          <div>
            <Database size={22} />
            <span>
              <strong>业务数据库</strong>
              <small>MySQL 备份文件与目标信息</small>
            </span>
            <b>
              {projectBackups.filter((item) => item.type === "MySQL").length}
            </b>
          </div>
          <div>
            <FileText size={22} />
            <span>
              <strong>配置与文件</strong>
              <small>变更前的配置恢复资料</small>
            </span>
            <b>
              {projectBackups.filter((item) => item.type === "配置文件").length}
            </b>
          </div>
          <div>
            <HardDrive size={22} />
            <span>
              <strong>本机保存</strong>
              <small>文件可用性与校验结果分别记录</small>
            </span>
            <Badge tone="gray">示例索引</Badge>
          </div>
        </div>
        <section className="panel">
          <SectionHeading
            title="备份文件"
            description="当前展示备份索引示例，不包含实际数据库文件。"
          />
          {projectBackups.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>文件名称</th>
                    <th>来源环境</th>
                    <th>版本</th>
                    <th>大小 / 时间</th>
                    <th>状态</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {projectBackups.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="inline">
                          <span className="backup-file-icon">
                            {item.type === "MySQL" ? (
                              <Database size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                          </span>
                          <div>
                            <strong className="file-table-name">
                              {item.name}
                            </strong>
                            <small className="table-subtext">
                              {item.type} · {item.id}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {
                          environments.find(
                            (env) => env.id === item.environmentId,
                          )?.name
                        }
                      </td>
                      <td>
                        <code>{item.version}</code>
                      </td>
                      <td className="table-time">
                        {item.size}
                        <small>{item.created.slice(5)}</small>
                      </td>
                      <td>
                        <Badge>{item.status}</Badge>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setDetailBackup(item);
                            setDialog("backup-detail");
                          }}
                        >
                          查看资料
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="还没有备份记录"
              detail="后续会显示手动备份与部署前备份的结果。"
            />
          )}
        </section>
        <Note tone="warm">
          备份文件生成与恢复验证是两项独立结果。当前阶段只展示页面结构，业务库一键恢复不在首期范围内。
        </Note>
      </>
    );
  }

  function renderAi() {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">CONTEXT FOR YOUR AI TOOLS</div>
            <h1>外部 AI 接入</h1>
            <p>把项目、版本和变更信息交给你正在使用的 AI 工具。</p>
          </div>
          <Button onClick={() => setDialog("integration")}>
            <Braces size={16} />
            Skill 与 MCP 的区别
          </Button>
        </div>
        <div className="ai-principle">
          <span>
            <Braces size={25} />
          </span>
          <div>
            <strong>工具管理项目信息，AI 留在你习惯的客户端里</strong>
            <p>
              没有内置模型。外部 AI
              可以读取项目资料，并通过统一接口调用一键发布。
            </p>
          </div>
          <Badge tone="green">读取 + 发布</Badge>
        </div>
        <div className="ai-layout">
          <aside className="panel context-settings">
            <h3>选择资料范围</h3>
            <Field label="项目">
              <input value={project.name} readOnly />
            </Field>
            <Field label="版本">
              <select
                value={release?.id || ""}
                onChange={(event) => setReleaseId(event.target.value)}
              >
                {projectReleases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="目标环境">
              <select
                value={environment?.id || ""}
                onChange={(event) => setEnvironmentId(event.target.value)}
              >
                {projectEnvironments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="info-divider" />
            <span className="field-label">包含内容</span>
            <label className="checkbox">
              <input type="checkbox" checked disabled />
              <span>版本与组件提交</span>
              <LockKeyhole size={12} />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeSql}
                onChange={(event) => setIncludeSql(event.target.checked)}
              />
              <span>本版本 SQL 脚本</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeConfigs}
                onChange={(event) => setIncludeConfigs(event.target.checked)}
              />
              <span>配置文件与目标路径</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeEnvironment}
                onChange={(event) =>
                  setIncludeEnvironment(event.target.checked)
                }
              />
              <span>环境与部署信息</span>
            </label>
            <div className="secret-exclusion">
              <ShieldCheck size={16} />
              <span>账号密码、私钥、Token 不进入资料。</span>
            </div>
            <Button
              variant="primary"
              className="full-width"
              disabled={!release}
              onClick={() => copy(context)}
            >
              <Copy size={15} />
              复制资料
            </Button>
            <Button
              className="full-width"
              disabled={!release}
              onClick={() => {
                downloadText(
                  `${project.key}-${release?.name}-context.${aiFormat === "JSON" ? "json" : "md"}`,
                  context,
                );
                notify("已导出当前选择的示例资料。");
              }}
            >
              <ArrowDownToLine size={15} />
              导出资料文件
            </Button>
          </aside>
          <section className="panel context-preview">
            <div className="code-toolbar">
              <span>
                <FileText size={16} />
                <strong>资料预览</strong>
                <span className="subtle-tag">只读</span>
              </span>
              <div className="segmented">
                {["Markdown", "JSON"].map((item) => (
                  <button
                    key={item}
                    className={aiFormat === item ? "active" : ""}
                    onClick={() => setAiFormat(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <pre aria-label="外部 AI 资料预览">{context}</pre>
            <div className="code-footer">
              <span>示例数据 · 不调用任何模型</span>
              <span>{context.length.toLocaleString()} 字符</span>
            </div>
          </section>
        </div>
        <div className="integration-cards">
          <button className="panel" onClick={() => setDialog("integration")}>
            <FileText size={22} />
            <div>
              <h3>Skill：告诉 AI 怎么使用</h3>
              <p>操作说明与使用约定，交给外部 AI 客户端阅读。</p>
            </div>
            <ArrowUpRight size={17} />
          </button>
          <button className="panel" onClick={() => setDialog("integration")}>
            <Braces size={22} />
            <div>
              <h3>MCP：让 AI 按接口获取信息</h3>
              <p>外部客户端通过标准协议查询资料、调用发布，无需内置模型。</p>
            </div>
            <ArrowUpRight size={17} />
          </button>
        </div>
      </>
    );
  }

  const views: Record<Page, () => React.ReactNode> = {
    overview: renderOverview,
    projects: renderProjects,
    versions: renderVersions,
    environments: renderEnvironments,
    deployments: renderDeployments,
    backups: renderBackups,
    ai: renderAi,
  };
  const pageTitle = navigation.find((item) => item.id === page)?.title;
  const matchingProjects = search
    ? projects.filter((item) =>
        (item.name + item.key).toLowerCase().includes(search.toLowerCase()),
      )
    : [];
  const matchingReleases = search
    ? releases.filter((item) =>
        (item.name + item.title).toLowerCase().includes(search.toLowerCase()),
      )
    : [];

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="mobile-overlay"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <span>
            Release<span className="brand-light">Workbench</span>
          </span>
        </a>
        <div className="workspace-label">
          个人工作空间 <span>LOCAL</span>
        </div>
        <div className="project-switcher">
          <span className={`mini-project-avatar ${project.color}`}>
            <FolderGit2 size={16} />
          </span>
          <select
            aria-label="切换当前项目"
            value={projectId}
            onChange={(event) => selectProject(event.target.value)}
          >
            {projects.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <div className="nav-caption">工作台</div>
        <nav className="sidebar-nav" aria-label="主导航">
          {navigation.map((item) => (
            <button
              className={page === item.id ? "active" : ""}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.title}</span>
              {item.id === "versions" && (
                <span className="nav-counter">{projectReleases.length}</span>
              )}
              {item.id === "ai" && <span className="nav-small">资料</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setDialog("help")}>
            <CircleHelp size={17} />
            使用与评审说明
            <ArrowUpRight size={13} />
          </button>
          <div className="local-status">
            <span className="local-status-dot" />
            <div>
              <strong>本地工作台</strong>
              <small>单人单机 · 前端样稿</small>
            </div>
            <span className="local-avatar">本</span>
          </div>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <span>{page === "projects" ? "全部项目" : project.name}</span>
            {page !== "projects" && (
              <>
                <ChevronRight size={13} />
                <strong>{pageTitle}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={15} />
              <input
                aria-label="全局搜索"
                value={search}
                placeholder="搜索项目、版本..."
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearch("");
                }}
              />
              <span>⌕</span>
              {search && (
                <div className="search-popover">
                  {matchingProjects.length === 0 &&
                    matchingReleases.length === 0 && (
                      <p>没有匹配的项目或版本</p>
                    )}
                  {matchingProjects.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        selectProject(item.id);
                        navigate("overview");
                      }}
                    >
                      <FolderGit2 size={16} />
                      <span>
                        {item.name}
                        <small>项目 · {item.key}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {matchingReleases.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        selectProject(item.projectId);
                        openRelease(item.id);
                      }}
                    >
                      <Package size={16} />
                      <span>
                        {item.name}
                        <small>{item.title}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <span className="profile-label">
              <span>本</span>本地用户
            </span>
          </div>
        </header>
        <div className="prototype-notice">
          <span>
            <span className="prototype-dot" />
            交互样稿
          </span>
          <p>示例数据 · 不连接真实服务，刷新后重置</p>
          <button onClick={() => setDialog("help")}>
            查看说明
            <ChevronRight size={12} />
          </button>
        </div>
        <main className="main-content" key={`${page}-${projectId}`}>
          {views[page]()}
        </main>
        <footer className="app-footer">
          <span>Release Workbench</span>
          <span>
            你的项目，每一次发布都有记录。
            <i />
            前端评审 v0.2
          </span>
        </footer>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {dialog === "project" && (
        <Modal
          title="新建项目"
          subtitle="项目用于组织组件、环境和所有发布版本。"
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = text(form, "name");
              const key = text(form, "key");
              if (projects.some((item) => item.key === key))
                return notify("项目标识已存在，请更换标识。");
              const item: Project = {
                id: unique("project"),
                name,
                key,
                description: text(form, "description"),
                color: "green",
                updated: "刚刚",
              };
              setProjects((previous) => [...previous, item]);
              setProjectId(item.id);
              setPage("overview");
              setDialog(null);
              notify("项目已在样稿中创建，下一步可添加环境和版本。");
            }}
          >
            <div className="modal-body">
              <Field label="项目名称" required>
                <input
                  name="name"
                  required
                  placeholder="例如：订单管理系统"
                  maxLength={60}
                />
              </Field>
              <Field
                label="项目标识"
                required
                hint="用于识别项目，创建后保持稳定。"
              >
                <input
                  name="key"
                  required
                  pattern={"[a-zA-Z0-9_\\-]+"}
                  placeholder="例如：order-platform"
                  maxLength={60}
                />
              </Field>
              <Field label="项目说明">
                <textarea
                  name="description"
                  rows={3}
                  placeholder="简要说明项目用途和包含的服务"
                />
              </Field>
            </div>
            <div className="modal-footer">
              <Button onClick={closeDialog}>取消</Button>
              <Button type="submit" variant="primary">
                <Plus size={15} />
                创建项目
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "version" && (
        <Modal
          title="新建版本"
          subtitle="默认按年月日和当日序号命名，测试、生产可以复用。"
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = text(form, "name");
              if (projectReleases.some((item) => item.name === name))
                return notify("当前项目中已经存在这个版本号。");
              const base = releases.find(
                (item) => item.id === text(form, "base"),
              );
              const newRelease: Release = {
                id: unique("release"),
                projectId,
                name,
                title: text(form, "title"),
                status: "草稿",
                created: stamp(),
                author: "本地用户",
                components: clone(base?.components || []),
                scripts: form.has("copySql")
                  ? clone(base?.scripts || []).map((item) => ({
                      ...item,
                      id: unique("sql"),
                      kind: "沿用",
                      previousSql: item.sql,
                    }))
                  : [],
                configs: clone(base?.configs || []).map((item) => ({
                  ...item,
                  id: unique("config"),
                  previousContent: item.content,
                })),
              };
              setReleases((previous) => [newRelease, ...previous]);
              setReleaseId(newRelease.id);
              setVersionOpen(true);
              setReleaseTab("summary");
              setPage("versions");
              setDialog(null);
              notify(`已创建草稿版本 ${name}。`);
            }}
          >
            <div className="modal-body">
              <Field label="所属项目">
                <input value={project.name} readOnly />
              </Field>
              <Field
                label="版本号"
                required
                hint="示例：20261020-01，同一天新建时自动递增后缀。"
              >
                <input
                  name="name"
                  defaultValue={nextVersion(releases, projectId)}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="发布内容" required>
                <input
                  name="title"
                  placeholder="简要描述本次更新"
                  required
                  maxLength={120}
                />
              </Field>
              <Field label="从已有版本复制">
                <select name="base" defaultValue={release?.id || ""}>
                  <option value="">创建空白版本</option>
                  {projectReleases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.title}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="checkbox">
                <input name="copySql" type="checkbox" />
                <span>同时复制基准版本 SQL（默认只复制组件和配置）</span>
              </label>
              <Note>
                每个版本单独维护脚本变化。复制 SQL
                后仍需核对哪些变更确实属于本次发布。
              </Note>
            </div>
            <div className="modal-footer">
              <Button onClick={closeDialog}>取消</Button>
              <Button type="submit" variant="primary">
                <Plus size={15} />
                创建草稿版本
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "sql" && release && (
        <Modal
          title={editingScript ? "编辑版本 SQL" : "添加版本 SQL"}
          subtitle={`${release.name} · 脚本内容、目标库和顺序随版本保存。`}
          wide
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = text(form, "name");
              if (
                release.scripts.some(
                  (item) => item.id !== editingScript?.id && item.name === name,
                )
              )
                return notify("当前版本已存在同名脚本。");
              const item: SqlScript = {
                id: editingScript?.id || unique("sql"),
                name,
                database: text(form, "database"),
                order: Number(text(form, "order")),
                kind: editingScript?.previousSql
                  ? String(form.get("sql") || "") === editingScript.previousSql
                    ? "沿用"
                    : "修改"
                  : "新增",
                description: text(form, "description"),
                sql: String(form.get("sql") || ""),
                previousSql: editingScript?.previousSql || "",
              };
              updateRelease((value) => ({
                ...value,
                scripts: editingScript
                  ? value.scripts.map((old) =>
                      old.id === item.id ? item : old,
                    )
                  : [...value.scripts, item],
              }));
              setScriptId(item.id);
              setReleaseTab("sql");
              setDialog(null);
              notify("版本脚本已保存到页面草稿。");
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="脚本文件名" required>
                  <input
                    name="name"
                    defaultValue={editingScript?.name || ""}
                    placeholder="004_add_order_status.sql"
                    required
                  />
                </Field>
                <Field label="逻辑数据库" required>
                  <input
                    name="database"
                    defaultValue={editingScript?.database || "order_db"}
                    required
                  />
                </Field>
                <Field label="执行顺序" required>
                  <input
                    name="order"
                    type="number"
                    min="1"
                    max="9999"
                    defaultValue={
                      editingScript?.order || release.scripts.length + 1
                    }
                    required
                  />
                </Field>
                <Field label="变更说明">
                  <input
                    name="description"
                    defaultValue={editingScript?.description || ""}
                    placeholder="说明本次数据库变化"
                  />
                </Field>
              </div>
              <Field label="SQL 脚本内容" required>
                <textarea
                  className="code-input"
                  name="sql"
                  rows={13}
                  defaultValue={editingScript?.sql || "-- 在此维护本版本 SQL\n"}
                  required
                  spellCheck={false}
                />
              </Field>
            </div>
            <div className="modal-footer">
              <span className="muted small">仅保存内容，不执行 SQL</span>
              <Button onClick={closeDialog}>取消</Button>
              <Button type="submit" variant="primary">
                保存脚本
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "config" && release && (
        <Modal
          title={editingConfig ? "编辑配置文件" : "添加配置文件"}
          subtitle={`${release.name} · 配置内容保存为版本副本。`}
          wide
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = text(form, "name");
              if (
                release.configs.some(
                  (item) => item.id !== editingConfig?.id && item.name === name,
                )
              )
                return notify("当前版本已存在同名配置文件。");
              const item: ConfigFile = {
                id: editingConfig?.id || unique("config"),
                name,
                path: text(form, "path"),
                format: text(form, "format"),
                content: String(form.get("content") || ""),
                previousContent: editingConfig?.previousContent || "",
              };
              updateRelease((value) => ({
                ...value,
                configs: editingConfig
                  ? value.configs.map((old) =>
                      old.id === item.id ? item : old,
                    )
                  : [...value.configs, item],
              }));
              setConfigId(item.id);
              setReleaseTab("configs");
              setDialog(null);
              notify("版本配置已保存。当前没有同步到服务器或 Nacos。");
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="配置文件名" required>
                  <input
                    name="name"
                    defaultValue={editingConfig?.name || ""}
                    placeholder="application.yml"
                    required
                  />
                </Field>
                <Field label="文件格式">
                  <select
                    name="format"
                    defaultValue={editingConfig?.format || "YAML"}
                  >
                    <option>YAML</option>
                    <option>JSON</option>
                    <option>properties</option>
                    <option>文本</option>
                  </select>
                </Field>
              </div>
              <Field label="目标路径模板" required>
                <input
                  name="path"
                  defaultValue={
                    editingConfig?.path || "${CONFIG_PATH}/application.yml"
                  }
                  required
                />
              </Field>
              <Field label="配置文件内容" required>
                <textarea
                  className="code-input"
                  name="content"
                  rows={13}
                  defaultValue={editingConfig?.content || ""}
                  required
                  spellCheck={false}
                />
              </Field>
              <Note>
                秘密使用变量占位。后续接入 Nacos
                时，需要单独配置映射并明确推送方向。
              </Note>
            </div>
            <div className="modal-footer">
              <Button onClick={closeDialog}>取消</Button>
              <Button type="submit" variant="primary">
                保存配置
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "component" && release && (
        <Modal
          title={editingComponent ? "编辑代码组件" : "添加代码组件"}
          subtitle="登记本版本的代码来源与固定提交。"
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const item: Component = {
                id: editingComponent?.id || unique("component"),
                name: text(form, "name"),
                repository: text(form, "repository"),
                branch: text(form, "branch"),
                commit: text(form, "commit"),
                artifact: text(form, "artifact"),
                kind: text(form, "kind"),
              };
              updateRelease((value) => ({
                ...value,
                components: editingComponent
                  ? value.components.map((old) =>
                      old.id === item.id ? item : old,
                    )
                  : [...value.components, item],
              }));
              setDialog(null);
              notify("组件信息已保存到当前版本草稿。");
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="组件名称" required>
                  <input
                    name="name"
                    defaultValue={editingComponent?.name}
                    required
                  />
                </Field>
                <Field label="组件类型">
                  <select
                    name="kind"
                    defaultValue={editingComponent?.kind || "后端服务"}
                  >
                    <option>后端服务</option>
                    <option>前端应用</option>
                    <option>其他组件</option>
                  </select>
                </Field>
              </div>
              <Field label="Git 仓库" required>
                <input
                  name="repository"
                  defaultValue={editingComponent?.repository}
                  placeholder="git.example.com/team/service.git"
                  required
                />
              </Field>
              <div className="form-grid">
                <Field label="来源分支" required>
                  <input
                    name="branch"
                    defaultValue={editingComponent?.branch || "main"}
                    required
                  />
                </Field>
                <Field label="固定 Commit" required>
                  <input
                    name="commit"
                    defaultValue={editingComponent?.commit}
                    placeholder="例如 c71b3e8"
                    pattern="[0-9a-fA-F]{7,40}"
                    required
                  />
                </Field>
              </div>
              <Field label="构建产物">
                <input
                  name="artifact"
                  defaultValue={editingComponent?.artifact}
                  placeholder="service.jar"
                />
              </Field>
            </div>
            <div className="modal-footer">
              <Button onClick={closeDialog}>取消</Button>
              <Button type="submit" variant="primary">
                保存组件
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "environment" && (
        <Modal
          title="新建环境"
          subtitle="版本复用，连接和发布路径按环境单独维护。"
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const key = text(form, "key");
              if (projectEnvironments.some((item) => item.key === key))
                return notify("当前项目中已存在这个环境标识。");
              const item: Environment = {
                ...clone(initialEnvironments[0]),
                id: unique("environment"),
                projectId,
                name: text(form, "name"),
                key,
                type: text(form, "type"),
                host: text(form, "host"),
                currentVersion: "",
                checkedAt: "尚未检查",
              };
              setEnvironments((previous) => [...previous, item]);
              setEnvironmentId(item.id);
              setPage("environments");
              setDialog(null);
              notify("环境已创建，请在连接页维护实际字段。");
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="环境名称" required>
                  <input name="name" placeholder="例如：预发布环境" required />
                </Field>
                <Field label="环境标识" required>
                  <input
                    name="key"
                    placeholder="例如：staging"
                    pattern={"[a-zA-Z0-9_\\-]+"}
                    required
                  />
                </Field>
                <Field label="环境类型">
                  <select name="type">
                    <option>测试</option>
                    <option>生产</option>
                    <option>开发</option>
                    <option>自定义</option>
                  </select>
                </Field>
                <Field label="Linux 主机地址" required>
                  <input name="host" placeholder="例如：192.0.2.100" required />
                </Field>
              </div>
              <Note>
                创建后可分别维护 SSH、MySQL、Jenkins
                及文件路径。新环境尚未执行连接检查。
              </Note>
            </div>
            <div className="modal-footer">
              <Button onClick={closeDialog}>取消</Button>
              <Button type="submit" variant="primary">
                创建环境
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "deploy" && release && (
        <Modal
          title="发布预览"
          subtitle={`${project.name} / ${release.name} · ${release.title}`}
          wide
          onClose={closeDialog}
        >
          <div className="modal-body deploy-body">
            <Note tone="warm">
              前端流程演示：不会连接服务器、执行 SQL、触发 Jenkins 或创建备份。
            </Note>
            <div className="deployment-target">
              <Field label="发布到环境">
                <select
                  disabled={demoState !== "idle"}
                  value={environment?.id || ""}
                  onChange={(event) => setEnvironmentId(event.target.value)}
                >
                  {projectEnvironments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.host}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <span>当前完整成功版本</span>
                <code>{environment?.currentVersion || "尚未发布"}</code>
              </div>
              <ArrowRight size={20} />
              <div>
                <span>本次版本</span>
                <code>{release.name}</code>
              </div>
              <Badge>{release.status}</Badge>
            </div>
            <div className="deployment-scope">
              <span>
                <GitBranch size={15} />
                {release.components.length} 个组件
              </span>
              <span>
                <Database size={15} />
                {release.scripts.length} 个 SQL
              </span>
              <span>
                <FileText size={15} />
                {release.configs.length} 个配置
              </span>
              <span>
                <Server size={15} />
                {environment?.deployPath || "未配置环境"}
              </span>
            </div>
            {release.status === "草稿" && (
              <div className="draft-warning">
                <Info size={16} />
                <span>版本仍是草稿，标记就绪后可演示发布。</span>
                <Button
                  onClick={() => {
                    updateRelease((value) => ({ ...value, status: "就绪" }));
                    notify("版本已在样稿中标记就绪。");
                  }}
                >
                  标记就绪
                </Button>
              </div>
            )}
            <div className="execution-steps">
              {planSteps.map((item, index) => {
                const done =
                  demoState === "done" ||
                  (demoState === "running" && index < demoStep);
                const running = demoState === "running" && index === demoStep;
                return (
                  <div
                    key={item.name}
                    className={done ? "done" : running ? "running" : ""}
                  >
                    <span className="step-bubble">
                      {done ? (
                        <Check size={16} />
                      ) : running ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.detail}</p>
                    </div>
                    <span className="step-result">
                      {done ? "演示完成" : running ? "演示中" : "待执行"}
                    </span>
                  </div>
                );
              })}
            </div>
            {demoState === "done" && (
              <div className="demo-result">
                <CheckCircle2 size={19} />
                <div>
                  <strong>发布流程演示完成</strong>
                  <p>这是一条页面演示记录，没有更新任何真实环境。</p>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <span className="muted small">
              Job：{environment?.job || "未绑定"}
            </span>
            <Button onClick={closeDialog}>
              {demoState === "running" ? "结束演示" : "关闭"}
            </Button>
            <Button
              variant="primary"
              disabled={
                demoState !== "idle" ||
                release.status !== "就绪" ||
                !environment
              }
              onClick={() => {
                setDemoState("running");
                setDemoStep(0);
              }}
            >
              <Play size={15} />
              {demoState === "done"
                ? "演示已完成"
                : demoState === "running"
                  ? "正在演示..."
                  : "演示一键发布"}
            </Button>
          </div>
        </Modal>
      )}

      {dialog === "deployment-detail" && detailDeployment && (
        <Modal
          title={`部署详情 · ${detailDeployment.id}`}
          subtitle={`${environments.find((item) => item.id === detailDeployment.environmentId)?.name} / ${releases.find((item) => item.id === detailDeployment.versionId)?.name} · 示例执行记录`}
          wide
          onClose={closeDialog}
        >
          <div className="deployment-detail-header">
            <Badge>{detailDeployment.status}</Badge>
            <span>{detailDeployment.started}</span>
            <span>耗时 {detailDeployment.duration}</span>
            <span>{detailDeployment.actor}</span>
          </div>
          <div className="execution-detail">
            <aside>
              {detailDeployment.steps.map((item, index) => (
                <button
                  className={index === selectedStep ? "selected" : ""}
                  key={item.name}
                  onClick={() => setSelectedStep(index)}
                >
                  {item.state === "成功" ? (
                    <CheckCircle2 className="text-green" size={17} />
                  ) : item.state === "失败" ? (
                    <XCircle className="text-red" size={17} />
                  ) : (
                    <Clock3 size={17} />
                  )}
                  <span>
                    {item.name}
                    <small>{item.state}</small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </aside>
            <div className="execution-log">
              <div className="between">
                <span>
                  <SquareTerminal size={15} />
                  {detailDeployment.steps[selectedStep].name}
                </span>
                <Badge>{detailDeployment.steps[selectedStep].state}</Badge>
              </div>
              <pre>
                {detailDeployment.steps[selectedStep].state === "失败"
                  ? "[13:43:18] 准备上传 application.yml\n[13:43:18] 目标：/opt/apps/order/config\n[13:43:19] ERROR: Permission denied\n[13:43:19] 目标目录不具备写入权限\n[13:43:19] 停止执行，后续发布步骤未运行\n\n建议：核对部署账号和目录权限后，\n根据已完成的步骤重新生成后续计划。"
                  : detailDeployment.steps[selectedStep].state === "未执行"
                    ? "此步骤尚未执行。\n前置步骤失败，后续操作已停止。"
                    : `[示例日志] ${detailDeployment.steps[selectedStep].name}\n开始处理目标环境...\n${detailDeployment.steps[selectedStep].detail}\n步骤完成，结果已记录。\n\n以上为页面展示用日志，没有执行真实操作。`}
              </pre>
            </div>
          </div>
          <div className="modal-footer">
            <span className="muted small">
              保留已完成步骤与备份，不自动重放 SQL
            </span>
            <Button onClick={closeDialog}>关闭</Button>
          </div>
        </Modal>
      )}

      {dialog === "backup-detail" && detailBackup && (
        <Modal
          title="备份资料"
          subtitle="示例索引，不包含真实备份文件。"
          onClose={closeDialog}
        >
          <div className="modal-body">
            <div className="backup-detail-title">
              <Database size={25} />
              <strong>{detailBackup.name}</strong>
            </div>
            <dl className="detail-list">
              <div>
                <dt>备份编号</dt>
                <dd>{detailBackup.id}</dd>
              </div>
              <div>
                <dt>来源版本</dt>
                <dd>
                  <code>{detailBackup.version}</code>
                </dd>
              </div>
              <div>
                <dt>来源环境</dt>
                <dd>
                  {
                    environments.find(
                      (item) => item.id === detailBackup.environmentId,
                    )?.name
                  }
                </dd>
              </div>
              <div>
                <dt>文件大小</dt>
                <dd>{detailBackup.size}</dd>
              </div>
              <div>
                <dt>生成时间</dt>
                <dd>{detailBackup.created}</dd>
              </div>
              <div>
                <dt>本机位置</dt>
                <dd>
                  <code>{detailBackup.location}</code>
                </dd>
              </div>
              <div>
                <dt>恢复验证</dt>
                <dd>尚未验证（示例）</dd>
              </div>
            </dl>
          </div>
          <div className="modal-footer">
            <Button onClick={closeDialog}>关闭</Button>
            <Button
              variant="primary"
              onClick={() => {
                downloadText(
                  `${detailBackup.id}-metadata.json`,
                  JSON.stringify(
                    {
                      ...detailBackup,
                      note: "示例备份索引，不是数据库备份文件",
                    },
                    null,
                    2,
                  ),
                );
                notify("已下载示例备份资料清单。");
              }}
            >
              <ArrowDownToLine size={15} />
              下载资料清单
            </Button>
          </div>
        </Modal>
      )}

      {dialog === "integration" && (
        <Modal
          title="Skill 与 MCP 怎么选"
          subtitle="两种方式都服务于外部 AI 工具，项目本身不需要接入大模型。"
          wide
          onClose={closeDialog}
        >
          <div className="modal-body">
            <div className="comparison-grid">
              <div>
                <FileText size={25} />
                <h3>Skill 是操作说明</h3>
                <p>
                  告诉外部 AI
                  应该读哪些资料、如何理解版本、怎样使用可用命令。安装在外部 AI
                  客户端里。
                </p>
                <ul>
                  <li>适合约定工作流程和资料格式</li>
                  <li>本身不会自动产生可调用接口</li>
                  <li>可以和 MCP 配合使用</li>
                </ul>
              </div>
              <div>
                <Braces size={25} />
                <h3>MCP 是标准接口</h3>
                <p>
                  让外部 AI 按协议查询项目、版本、SQL
                  和环境信息，并调用一键发布。工具处理请求，无需调用模型。
                </p>
                <ul>
                  <li>适合持续读取结构化项目资料</li>
                  <li>开放资料查询与统一部署能力</li>
                  <li>真实接口将在后端阶段开发</li>
                </ul>
              </div>
            </div>
            <Note>
              已确认允许外部 AI
              读取信息并调用一键发布。后续发布接口与页面共用预览、执行和日志流程；当前样稿仅提供资料预览、复制和导出，不启动真实服务。
            </Note>
          </div>
          <div className="modal-footer">
            <Button onClick={closeDialog}>明白了</Button>
            <Button
              variant="primary"
              onClick={() => {
                setDialog(null);
                navigate("ai");
              }}
            >
              查看外部 AI 资料
              <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}

      {dialog === "help" && (
        <Modal
          title="前端样稿评审说明"
          subtitle="先确认页面和交互，再开发真实业务。"
          onClose={closeDialog}
        >
          <div className="modal-body">
            <ol className="review-guide">
              <li>
                <strong>从一个项目开始</strong>
                <p>查看环境状态，或新建项目与版本。</p>
              </li>
              <li>
                <strong>检查版本资源</strong>
                <p>重点体验 SQL 内容、变化对比、配置和代码组件。</p>
              </li>
              <li>
                <strong>维护连接与路径</strong>
                <p>在环境页切换 SSH、MySQL、Jenkins 和文件路径。</p>
              </li>
              <li>
                <strong>走一遍发布流程</strong>
                <p>将草稿标记就绪，预览目标并演示步骤。</p>
              </li>
              <li>
                <strong>把资料交给外部 AI</strong>
                <p>选择范围，复制或导出 Markdown、JSON。</p>
              </li>
            </ol>
            <Note tone="warm">
              所有数据为示例。没有后端、真实连接和模型调用；页面刷新后重置，凭据输入不持久化。
            </Note>
          </div>
          <div className="modal-footer">
            <Button onClick={closeDialog}>开始查看</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
