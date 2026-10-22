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
  HardDrive,
  History,
  Info,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Menu,
  Package,
  Play,
  Plus,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { nextVersion, planSteps } from "./data";
import type {
  ConfigFile,
  Deployment,
  Environment,
  Page,
  Project,
  Release,
  SqlScript,
  Service,
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
import EnvironmentEditor from "./EnvironmentConfigEditor";
import ServiceManager, { ProjectServiceFields } from "./ServiceManager";
import JenkinsSettings from "./JenkinsSettings";
import PublishDialog, { DeploymentDetail } from "./LivePublishDialog";
import BackupsPage from "./BackupsPage";
import AIConnectionInfo from "./AIConnectionInfo";
import ProjectSwitcher from "./ProjectSwitcher";
import VersionServices, { VersionServiceEditor } from "./VersionServices";
import { useCollection, useWorkbench } from "./state";
import { api } from "./api";

type Dialog =
  | "project"
  | "version"
  | "sql"
  | "config"
  | "environment"
  | "deploy"
  | "deployment-detail"
  | "help"
  | "integration"
  | null;
const navigation = [
  { id: "overview", title: "项目概览", icon: LayoutDashboard },
  { id: "projects", title: "全部项目", icon: FolderGit2 },
  { id: "services", title: "服务管理", icon: Code2 },
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
  { id: "components", label: "涉及服务", icon: GitBranch },
  { id: "steps", label: "操作说明", icon: ListChecks },
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

async function importText(
  event: React.ChangeEvent<HTMLInputElement>,
  field: string,
  notify: (message: string) => void,
) {
  const file = event.target.files?.[0],
    form = event.target.form;
  if (!file || !form) return;
  if (file.size > 1000000) return notify("文本文件不得超过 1 MB。");
  try {
    const buffer = await file.arrayBuffer();
    const content = new TextDecoder("utf-8", { fatal: true })
      .decode(buffer)
      .replace(/^\uFEFF/, "");
    const input = form.elements.namedItem(field) as HTMLTextAreaElement;
    if (input) input.value = content;
    const name = form.elements.namedItem("name") as HTMLInputElement;
    if (name && !name.value) name.value = file.name;
    notify("文件已读入，点击保存后写入当前版本。");
  } catch {
    notify("无法读取文件，请使用 UTF-8 文本。");
  }
}

export default function App() {
  const [projectServiceDrafts, setProjectServiceDrafts] = useState<Service[]>(
    [],
  );
  const workbench = useWorkbench();
  const [jenkinsProfiles] = useCollection("jenkinsProfiles");
  const [projects, setProjects] = useCollection("projects");
  const [releases, setReleases] = useCollection("releases");
  const [environments, setEnvironments] = useCollection("environments");
  const deployments = workbench.state.deployments;
  const [deployVersion, setDeployVersion] = useState<Release | undefined>();
  const [page, setPage] = useState<Page>("overview");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [releaseId, setReleaseId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
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
  const [detailDeployment, setDetailDeployment] = useState<Deployment | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiFormat, setAiFormat] = useState("Markdown");
  const [includeSql, setIncludeSql] = useState(true);
  const [includeConfigs, setIncludeConfigs] = useState(true);
  const [includeEnvironment, setIncludeEnvironment] = useState(true);
  const [recordFilter, setRecordFilter] = useState("全部");
  const [versionServiceIds, setVersionServiceIds] = useState<string[]>([]);
  useEffect(() => {
    setVersionServiceIds([]);
  }, [dialog, projectId]);

  const project = projects.find((item) => item.id === projectId) ||
    projects[0] || {
      id: "",
      name: "请选择项目",
      key: "",
      description: "",
      color: "green",
      updated: "",
      services: [],
    };
  const projectServices = project.services;
  const projectReleases = releases.filter(
    (item) => item.projectId === projectId,
  );
  const involvedServices = (value: Release) =>
    projectServices.filter((service) =>
      (value.serviceIds || []).includes(service.id),
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
    setDialog("deployment-detail");
  }
  function openDeploy(version?: Release) {
    setDeployVersion(version);
    setDialog("deploy");
  }
  function closeDialog() {
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
    const data = {
      notice:
        "本机项目资料，不导出连接密码、私钥或 Token。SQL 和配置文本保留原样。",
      project: {
        name: project.name,
        key: project.key,
        services: project.services,
      },
      release: release
        ? {
            name: release.name,
            title: release.title,
            status: release.status,
            services: involvedServices(release),
          }
        : null,
      allowedActions: [
        "项目、服务、环境、版本及 SQL/配置资料的增删改查",
        "选择环境、服务及支持的分支，触发已绑定 Jenkins Job",
      ],
      manualActions: ["SQL 由人工执行", "配置文件由人工更新"],
      ...(includeSql ? { sqlScripts: release?.scripts || [] } : {}),
      ...(includeConfigs ? { configurations: release?.configs || [] } : {}),
      ...(includeEnvironment
        ? {
            environment: environment
              ? {
                  name: environment.name,
                  servers: environment.servers.map((s) => ({
                    id: s.id,
                    name: s.name,
                    host: s.host,
                  })),
                  deployPath: environment.deployPath,
                  database: environment.database,
                  jobs: environment.bindings,
                  credentials: "只引用本地凭据，不导出秘密",
                }
              : null,
          }
        : {}),
    };
    if (aiFormat === "JSON") return JSON.stringify(data, null, 2);
    return `# ${project.name} · ${release?.name || "项目资料"}\n\n> 本机项目资料；不包含已保存的连接凭据。\n\n## 可调用范围\n\n选择环境和服务，仅触发 Jenkins Job；支持分支参数的任务可指定分支。不执行 SQL，不更新配置，不进行 SSH 部署。\n\n## 项目服务\n\n${project.services.map((s) => `- ${s.name}（${s.kind}）：${s.repository}，默认分支 ${s.defaultBranch}`).join("\n")}\n\n## 版本资料\n\n${release?.title || "暂无版本"}\n${
      release
        ? involvedServices(release)
            .map((s) => `- ${s.name}（${s.kind}）：${s.repository}`)
            .join("\n") || "尚未登记涉及服务"
        : ""
    }\n${includeEnvironment && environment ? `\n## 目标环境与任务\n\n${environment.name} · ${environment.servers.map((s) => s.host).join("、")}\n共用路径：${environment.deployPath}\n数据库：${environment.database}\n${environment.bindings.map((b) => `- ${project.services.find((s) => s.id === b.serviceId)?.name || b.serviceId}：${b.job || "未绑定"}；主机 ${(b.serverIds || []).map((id) => environment.servers.find((host) => host.id === id)?.host || id).join("、") || "未关联"}；${b.supportsBranch ? `分支参数 ${b.branchParameter}，可选 ${b.branches.join(" / ")}` : "使用 Job 自身配置"}；固定参数 ${b.parameters || "无"}`).join("\n")}\n` : ""}${includeSql ? `\n## SQL（人工执行）\n${release?.scripts.map((s) => `\n### ${s.name}\n\n${s.sql}\n`).join("\n") || "暂无脚本"}` : ""}${includeConfigs ? `\n## 配置文件（人工更新）\n${release?.configs.map((c) => `\n### ${c.name} · ${c.path}\n\n${c.content}\n`).join("\n") || "暂无配置文件"}` : ""}`;
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
                    <span title="涉及服务">
                      <GitBranch size={13} />
                      {(item.serviceIds || []).length}
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
              <th>服务 / 分支</th>
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
                  <small className="table-subtext">
                    {item.actor} · {item.versionName || "独立发布"}
                  </small>
                </td>
                <td>
                  <div className="record-services">
                    {item.services.map((service) => (
                      <span key={service.serviceId}>
                        <strong>{service.name}</strong>
                        <small>
                          {service.branch || "Job 自身配置"} · #
                          {service.buildNumber}
                        </small>
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {environments.find((value) => value.id === item.environmentId)
                    ?.name || "—"}
                </td>
                <td>
                  <Badge>{item.status}</Badge>
                </td>
                <td className="table-time">
                  {new Date(item.started).toLocaleString("zh-CN")}
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
      <Empty
        title="暂无部署记录"
        detail="按环境、服务及 Jenkins 构建结果保留记录。"
      />
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
                projectDeployments[0].status !== "成功" ? (
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
                ? `${projectDeployments[0].id} · 发布记录`
                : "暂无发布"}
            </small>
          </div>
        </div>
        <div className="overview-layout">
          <div className="overview-main">
            <section className="panel">
              <SectionHeading
                title="环境发布情况"
                description="项目内维护服务器和任务，按服务查看 Jenkins 构建结果"
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
                    <p className="env-version-label">服务关联主机资料</p>
                    <div className="env-version">
                      {item.servers.length} 台 Linux 节点
                    </div>
                    <div className="environment-card-meta">
                      <span>
                        <Server size={13} />
                        {item.servers.map((server) => server.host).join(" / ")}
                      </span>
                      <span>
                        <Database size={13} />
                        {item.database}
                      </span>
                    </div>
                    <div className="environment-card-footer">
                      <span className="muted">
                        <Clock3 size={12} />
                        {item.checkedAt}
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
              {projectDeployments.find((item) =>
                ["失败", "部分失败", "结果未知", "已中止"].includes(
                  item.status,
                ),
              ) && (
                <div className="deployment-alert">
                  <span className="alert-icon">
                    <Info size={16} />
                  </span>
                  <div>
                    <strong>最近有服务构建失败</strong>
                    <p>
                      部分 Jenkins 任务构建失败，可按服务查看结果与控制台资料。
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      showDeployment(
                        projectDeployments.find((item) =>
                          ["失败", "部分失败", "结果未知", "已中止"].includes(
                            item.status,
                          ),
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
                  <span>涉及服务</span>
                  <b>{release?.serviceIds?.length || 0}</b>
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
                版本保存 SQL 与配置变化；发布只触发所选服务的 Jenkins Job，SQL
                和配置由人工处理。
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
            <p>每个项目独立管理服务、环境与版本资源。</p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setProjectServiceDrafts([]);
              setDialog("project");
            }}
          >
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
            onClick={() => {
              setProjectServiceDrafts([]);
              setDialog("project");
            }}
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
          版本固定变更资料并可跨环境参考。Jenkins
          发布独立选择环境、服务和分支，SQL 与配置由人工处理。
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
                  JSON.stringify(
                    { ...release, involvedServices: involvedServices(release) },
                    null,
                    2,
                  ),
                  "application/json",
                );
                notify("已导出版本资料清单。");
              }}
            >
              <ArrowDownToLine size={15} />
              导出清单
            </Button>
            {editable ? (
              <Button
                onClick={() => {
                  updateRelease((value) => ({ ...value, status: "就绪" }));
                  notify("已提交就绪状态，版本资源随之锁定。");
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
            {release.status === "就绪" && (
              <Button
                disabled={!!workbench.pending}
                onClick={() => {
                  void workbench
                    .update("releases", (previous) =>
                      previous.map((value) =>
                        value.id === release.id
                          ? { ...value, status: "草稿" }
                          : value,
                      ),
                    )
                    .then(() =>
                      notify("已取消就绪，版本恢复为草稿，可以继续编辑。"),
                    )
                    .catch((error) => notify(`取消就绪失败：${error.message}`));
                }}
              >
                <Undo2 size={15} />
                取消就绪
              </Button>
            )}
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
                        : release.serviceIds?.length || 0}
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
                      <strong>
                        {release.serviceIds?.length || 0} 个涉及服务
                      </strong>
                      <small>本版本登记的影响范围</small>
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
                <h3>版本资料</h3>
                <div className="release-checks">
                  <span>
                    <CheckCircle2 size={15} />
                    涉及服务随版本保存，实际发布单独选择
                  </span>
                  <span>
                    <CheckCircle2 size={15} />
                    SQL 与配置随版本保存
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
                <h3>项目环境</h3>
                {projectEnvironments.map((item) => (
                  <div key={item.id} className="ready-environment">
                    <span
                      className={`env-dot ${item.type === "生产" ? "orange" : "blue"}`}
                    />
                    {item.name}
                    <code>{item.servers.length} 台服务器</code>
                  </div>
                ))}
                <p className="small muted">
                  就绪状态用于固定版本资料，不限制 Jenkins
                  发布。实际任务与分支以发布记录为准。
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
                  <p>管理本版本的增量 SQL、目标库与变化内容；由人工执行。</p>
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
                  <p>保存文件内容、路径和差异，由人工更新目标配置。</p>
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
                  detail="保存本地配置内容与差异，实际文件由人工更新。"
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
                title="本版本涉及服务"
                description="勾选本次变更涉及的项目服务，可以暂时留空，草稿期间随时补充。"
              />
              <VersionServiceEditor
                key={release.id}
                services={projectServices}
                selected={release.serviceIds || []}
                disabled={!editable}
                onSave={async (serviceIds) => {
                  await workbench.update("releases", (previous) =>
                    previous.map((value) =>
                      value.id === release.id
                        ? { ...value, serviceIds }
                        : value,
                    ),
                  );
                  notify("版本涉及服务已保存。");
                }}
              />
              <Note>
                这里保存版本影响范围。实际发布在统一发布入口选择环境、服务和分支，历史构建结果在部署记录中查看。
              </Note>
            </div>
          )}
          {releaseTab === "steps" && (
            <div className="steps-section">
              <SectionHeading
                title="Jenkins 发布流程"
                description="版本是变更资料，实际发布直接选择环境和服务。"
              />
              {planSteps.map((item, index) => (
                <div className="template-step" key={item.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <Badge tone="gray">Jenkins</Badge>
                </div>
              ))}
              <Note>
                SQL 由人工执行，配置由人工更新。工具只触发 Jenkins
                并读取结果，不执行服务器命令。
              </Note>
            </div>
          )}
        </section>
        {!editable && (
          <Note>
            <LockKeyhole size={14} />
            {release.status === "就绪"
              ? "版本资料已锁定，点击顶部“取消就绪”可恢复草稿并继续编辑。"
              : "归档版本的资源已锁定。需要修改时，请复制为新的草稿版本。"}
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
            <p>
              项目内维护多台服务器、共用部署路径、单一数据库与服务 Job 绑定。
            </p>
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
              detail="一个环境可维护多台 Linux 服务器和一个 MySQL 连接。"
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
                      {item.key} ·{" "}
                      {item.servers.map((server) => server.host).join(" / ")}
                    </small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
              <div className="connection-tip">
                <ShieldCheck size={20} />
                <h3>按环境维护</h3>
                <p>
                  主机按环境内的服务分别关联，数据库由环境共用；Jenkins
                  账号统一引用全局配置。
                </p>
              </div>
            </aside>
            <EnvironmentEditor
              key={environment.id}
              environment={environment}
              services={projectServices}
              profiles={jenkinsProfiles}
              onSave={async (value, secrets) => {
                await workbench.update("environments", (previous) =>
                  previous.map((item) => (item.id === value.id ? value : item)),
                );
                if (Object.values(secrets).some(Boolean))
                  await api("/credentials", {
                    method: "PUT",
                    body: JSON.stringify({
                      kind: "environment",
                      id: value.id,
                      values: secrets,
                    }),
                  });
                await workbench.refresh();
                notify("环境配置及凭据已保存到本机。");
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
            <p>按环境与服务记录 Jenkins Job、发布分支、构建结果和日志资料。</p>
          </div>
          <Button variant="primary" onClick={() => openDeploy()}>
            <Play size={15} />
            预览发布
          </Button>
        </div>
        <section className="panel">
          <div className="list-toolbar">
            <div className="filter-tabs">
              {[
                "全部",
                "排队中",
                "构建中",
                "成功",
                "部分失败",
                "失败",
                "结果未知",
                "已中止",
              ].map((label) => (
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
              Jenkins 发布记录
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
              <span>项目服务与版本变化</span>
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
              onClick={() => copy(context)}
            >
              <Copy size={15} />
              复制资料
            </Button>
            <Button
              className="full-width"
              onClick={() => {
                downloadText(
                  `${project.key}-${release?.name || "project"}-context.${aiFormat === "JSON" ? "json" : "md"}`,
                  context,
                );
                notify("已导出当前选择的项目资料。");
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
                <span className="subtle-tag">资料</span>
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
              <span>本机资料 · 不调用模型</span>
              <span>{context.length.toLocaleString()} 字符</span>
            </div>
          </section>
        </div>
        <AIConnectionInfo />
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
    services: () => (
      <ServiceManager
        services={projectServices}
        onSave={(services) =>
          setProjects((previous) =>
            previous.map((p) => (p.id === projectId ? { ...p, services } : p)),
          )
        }
        notify={notify}
      />
    ),
    jenkins: () => (
      <JenkinsSettings profiles={jenkinsProfiles} notify={notify} />
    ),
    projects: renderProjects,
    versions: renderVersions,
    environments: renderEnvironments,
    deployments: renderDeployments,
    backups: () => (
      <BackupsPage projectId={projectId} environments={projectEnvironments} />
    ),
    ai: renderAi,
  };
  const pageTitle =
    page === "jenkins"
      ? "Jenkins 设置"
      : navigation.find((item) => item.id === page)?.title;
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
        <ProjectSwitcher
          projects={projects}
          project={project}
          onSelect={selectProject}
        />
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
        <div className="nav-caption">全局设置</div>
        <nav className="sidebar-nav" aria-label="全局设置">
          <button
            className={page === "jenkins" ? "active" : ""}
            onClick={() => navigate("jenkins")}
          >
            <Settings2 size={18} />
            <span>Jenkins 设置</span>
            <span className="nav-small">共享</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setDialog("help")}>
            <CircleHelp size={17} />
            使用说明
            <ArrowUpRight size={13} />
          </button>
          <div className="local-status">
            <span className="local-status-dot" />
            <div>
              <strong>本地工作台</strong>
              <small>单人单机 · 本地保存</small>
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
            <span>
              {page === "projects"
                ? "全部项目"
                : page === "jenkins"
                  ? "全局设置"
                  : project.name}
            </span>
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
            本地应用
          </span>
          <p>
            {workbench.pending
              ? "正在保存…"
              : "资料保存到本机 SQLite · Jenkins 发布"}
          </p>
        </div>
        {workbench.error && (
          <div className="error-message persist-error" role="alert">
            {workbench.error}
            <Button onClick={workbench.clearError}>关闭提示</Button>
          </div>
        )}
        <main className="main-content" key={`${page}-${projectId}`}>
          {!projects.length &&
          !["jenkins", "projects", "backups"].includes(page) ? (
            <section className="panel welcome-panel">
              <FolderGit2 size={40} />
              <h1>开始管理第一个项目</h1>
              <p>
                先登记项目和服务，再添加环境。版本期间维护资料，发布时选择服务。
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setProjectServiceDrafts([]);
                  setDialog("project");
                }}
              >
                新建项目
              </Button>
            </section>
          ) : (
            views[page]()
          )}
        </main>
        <footer className="app-footer">
          <span>Release Workbench</span>
          <span>
            你的项目，每一次发布都有记录。
            <i />
            本地应用 v0.6.1
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
          wide
          subtitle="项目用于组织服务、Git、环境和所有版本资料。"
          onClose={closeDialog}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = text(form, "name");
              const key = text(form, "key");
              if (
                !name ||
                projectServiceDrafts.some(
                  (s) =>
                    !s.name.trim() ||
                    !s.repository.trim() ||
                    !s.defaultBranch.trim(),
                )
              )
                return notify("请补全项目名称和服务资料。");
              if (projects.some((item) => item.key === key))
                return notify("项目标识已存在，请更换标识。");
              if (
                new Set(projectServiceDrafts.map((s) => s.name.trim())).size !==
                projectServiceDrafts.length
              )
                return notify("项目服务名称不能重复。");
              const item: Project = {
                id: unique("project"),
                name,
                key,
                description: text(form, "description"),
                color: "green",
                updated: "刚刚",
                services: projectServiceDrafts.map((s) => ({
                  ...s,
                  name: s.name.trim(),
                  repository: s.repository.trim(),
                  defaultBranch: s.defaultBranch.trim(),
                })),
              };
              setProjects((previous) => [...previous, item]);
              setProjectId(item.id);
              setReleaseId("");
              setEnvironmentId("");
              setVersionOpen(false);
              setPage("services");
              setDialog(null);
              notify("项目已提交保存，下一步可添加环境和版本。");
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
              <ProjectServiceFields
                services={projectServiceDrafts}
                onChange={setProjectServiceDrafts}
              />
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
                components: [],
                serviceIds: versionServiceIds,
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
                <span>
                  同时复制基准版本 SQL（配置文件默认沿用，涉及服务自行勾选）
                </span>
              </label>
              <div className="form-section-title">
                <h3>涉及服务（可选）</h3>
                <p>现在不确定可以先留空，创建后再补充。</p>
              </div>
              <VersionServices
                services={projectServices}
                selected={versionServiceIds}
                onChange={setVersionServiceIds}
                compact
              />
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
                    defaultValue={
                      editingScript?.database || environment?.database || ""
                    }
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
              <Field label="导入 SQL 文件">
                <input
                  type="file"
                  accept=".sql,.txt"
                  onChange={(event) => void importText(event, "sql", notify)}
                />
              </Field>
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
              <Field label="导入配置文件">
                <input
                  type="file"
                  accept=".yml,.yaml,.json,.properties,.conf,.txt,.xml"
                  onChange={(event) =>
                    void importText(event, "content", notify)
                  }
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
                servers: [],
                bindings: [],
                deployPath: "",
                backupPath: "",
                dbHost: "",
                dbPort: "3306",
                database: "",
                dbUser: "",
                configPath: "",
                id: unique("environment"),
                projectId,
                name: text(form, "name"),
                key,
                type: text(form, "type"),
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
              </div>
              <Note>
                创建后按服务添加或复用多台主机，维护环境单一 MySQL
                连接与共用路径，并按服务绑定 Job。账号统一引用全局 Jenkins。
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

      {dialog === "deploy" && (
        <PublishDialog
          projectId={projectId}
          projectName={project.name}
          environments={projectEnvironments}
          initialEnvironmentId={environment?.id || ""}
          services={projectServices}
          profiles={jenkinsProfiles}
          version={deployVersion}
          versions={projectReleases}
          onComplete={() => void workbench.refresh()}
          onClose={closeDialog}
          onConfigure={() => {
            closeDialog();
            navigate("environments");
          }}
        />
      )}

      {dialog === "deployment-detail" && detailDeployment && (
        <DeploymentDetail
          record={detailDeployment}
          environmentName={
            environments.find((e) => e.id === detailDeployment.environmentId)
              ?.name || ""
          }
          onClose={closeDialog}
        />
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
                  <li>已提供本机 stdio MCP</li>
                </ul>
              </div>
            </div>
            <Note>
              已确认允许外部 AI
              读取信息并调用一键发布。后续发布接口与页面共用预览、执行和日志流程；通过本机
              MCP 查询资料和触发 Jenkins；SQL 和配置由人工处理。
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
          title="使用说明"
          subtitle="本地资料管理与 Jenkins 发布。"
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
                <p>管理 SQL、配置变化、服务主机与多版本发布快照。</p>
              </li>
              <li>
                <strong>维护连接与路径</strong>
                <p>
                  在环境页维护多台服务器、一个数据库和服务任务；全局统一维护
                  Jenkins 凭据。
                </p>
              </li>
              <li>
                <strong>走一遍发布流程</strong>
                <p>
                  选择环境与服务，为支持的任务选择分支，查看 Jenkins 构建结果。
                </p>
              </li>
              <li>
                <strong>把资料交给外部 AI</strong>
                <p>选择范围，复制或导出 Markdown、JSON。</p>
              </li>
            </ol>
            <Note tone="warm">
              资料保存到本机，连接凭据单独加密保存。SQL
              和配置由人工执行或更新，发布只触发 Jenkins。
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
