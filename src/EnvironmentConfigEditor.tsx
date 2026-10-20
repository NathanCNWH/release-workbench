import { useState } from "react";
import {
  Database,
  FileText,
  Plus,
  Save,
  Server,
  Trash2,
  Workflow,
} from "lucide-react";
import type { Environment, JenkinsProfile, JobBinding, Service } from "./types";
import { Badge, Button, Field, Note } from "./ui";
import { api, post } from "./api";

export default function EnvironmentEditor({
  environment,
  services,
  profiles,
  onSave,
  notify,
}: {
  environment: Environment;
  services: Service[];
  profiles: JenkinsProfile[];
  onSave: (
    value: Environment,
    secrets: Record<string, string>,
  ) => Promise<void>;
  notify: (value: string) => void;
}) {
  const [tab, setTab] = useState("ssh");
  const [draft, setDraft] = useState(environment);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  type TextKey =
    | "deployPath"
    | "backupPath"
    | "dbHost"
    | "dbPort"
    | "database"
    | "dbUser"
    | "configPath";
  const input = (key: TextKey, required = true) => (
    <input
      required={required}
      value={draft[key]}
      onChange={(e) => setDraft((old) => ({ ...old, [key]: e.target.value }))}
    />
  );
  const secret = (id: string, disabled = false, multiline = false) =>
    multiline ? (
      <textarea
        rows={5}
        autoComplete="off"
        value={secrets[id] || ""}
        onChange={(e) => setSecrets({ ...secrets, [id]: e.target.value })}
        placeholder="粘贴完整私钥，保留换行；留空不修改"
      />
    ) : (
      <input
        type="password"
        disabled={disabled}
        autoComplete="new-password"
        value={secrets[id] || ""}
        onChange={(e) => setSecrets({ ...secrets, [id]: e.target.value })}
        placeholder={
          disabled
            ? "读取 SSH_NAME / SSH_PWD"
            : "留空不修改；新值加密保存在本机"
        }
      />
    );
  const binding = (service: Service): JobBinding =>
    draft.bindings.find((b) => b.serviceId === service.id) || {
      serviceId: service.id,
      job: "",
      parameters: "",
      supportsBranch: false,
      branchParameter: "BRANCH",
      branches: [service.defaultBranch],
      defaultBranch: service.defaultBranch,
    };
  function updateBinding(value: JobBinding) {
    setDraft((old) => ({
      ...old,
      bindings: [
        ...old.bindings.filter((b) => b.serviceId !== value.serviceId),
        value,
      ],
    }));
  }
  const tabs = [
    { id: "ssh", name: "服务器 SSH", icon: Server },
    { id: "mysql", name: "MySQL 数据库", icon: Database },
    { id: "jobs", name: "服务发布任务", icon: Workflow },
    { id: "files", name: "文件与路径", icon: FileText },
  ];
  return (
    <section className="panel environment-editor">
      <div className="panel-heading">
        <div className="inline">
          <span className="environment-icon">
            <Server size={19} />
          </span>
          <div>
            <h2>{environment.name}</h2>
            <p>
              {environment.key} · {draft.servers.length} 台 Linux 服务器 · 1
              个数据库连接
            </p>
          </div>
        </div>
        <Badge>{environment.type}</Badge>
      </div>
      <div className="tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => {
              setTab(item.id);
            }}
          >
            <item.icon size={15} />
            {item.name}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            draft.bindings.some(
              (b) =>
                b.job &&
                b.supportsBranch &&
                (!b.branchParameter.trim() ||
                  !b.branches.length ||
                  !b.branches.includes(b.defaultBranch)),
            )
          )
            return notify(
              "支持分支选择的任务需要参数名、可选分支及有效默认分支。",
            );
          if (
            draft.servers.some(
              (s) => !s.host.trim() || !s.port.trim() || !s.username.trim(),
            )
          )
            return notify("请补全每台服务器的地址、端口和账号。");
          setBusy(true);
          try {
            const validSecrets = Object.fromEntries(
              Object.entries(secrets).filter(
                ([id]) =>
                  id === "database" ||
                  draft.servers.some((server) => server.id === id),
              ),
            );
            await onSave(draft, validSecrets);
            setSecrets({});
          } catch (error: any) {
            notify(`保存失败：${error.message}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="editor-form">
          {tab === "ssh" && (
            <>
              <div className="form-section-title">
                <h3>环境服务器</h3>
                <p>
                  可维护多台服务器，所有服务器共用下面的部署路径；仅保存连接资料。
                </p>
              </div>
              {draft.servers.map((server, index) => (
                <div className="server-edit-card" key={server.id}>
                  <div className="between">
                    <h3>服务器 {index + 1}</h3>
                    <Button
                      disabled={
                        busy ||
                        !environment.servers.some((s) => s.id === server.id)
                      }
                      onClick={() => {
                        setBusy(true);
                        void post(`/environments/${environment.id}/check`, {
                          kind: "ssh",
                          serverId: server.id,
                        })
                          .then((result) =>
                            notify(
                              `SSH 连接成功，主机指纹：${result.fingerprint}`,
                            ),
                          )
                          .catch((error) => notify(error.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      检查已保存连接
                    </Button>
                    <Button
                      aria-label={`移除服务器 ${index + 1}`}
                      disabled={draft.servers.length === 1}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          servers: draft.servers.filter(
                            (s) => s.id !== server.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      移除
                    </Button>
                  </div>
                  <div className="form-grid">
                    {(
                      [
                        { key: "name", label: "服务器名称" },
                        { key: "host", label: "服务器地址" },
                        { key: "port", label: "SSH 端口" },
                        { key: "username", label: "登录账号" },
                      ] as const
                    ).map((field) => (
                      <Field key={field.key} label={field.label} required>
                        <input
                          required
                          value={server[field.key]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              servers: draft.servers.map((s) =>
                                s.id === server.id
                                  ? { ...s, [field.key]: e.target.value }
                                  : s,
                              ),
                            })
                          }
                        />
                      </Field>
                    ))}
                    <Field label="认证方式">
                      <select
                        value={server.authentication}
                        onChange={(e) => {
                          const authentication = e.target
                            .value as typeof server.authentication;
                          setDraft({
                            ...draft,
                            servers: draft.servers.map((s) =>
                              s.id === server.id ? { ...s, authentication } : s,
                            ),
                          });
                          setSecrets((old) => ({ ...old, [server.id]: "" }));
                        }}
                      >
                        <option value="password">账号密码</option>
                        <option value="environment">
                          SSH_NAME / SSH_PWD 环境变量
                        </option>
                        <option value="key">SSH 私钥</option>
                      </select>
                    </Field>
                    <Field
                      label={
                        server.authentication === "key"
                          ? "SSH 私钥"
                          : "登录密码"
                      }
                    >
                      {secret(
                        server.id,
                        server.authentication === "environment",
                        server.authentication === "key",
                      )}
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                onClick={() =>
                  setDraft({
                    ...draft,
                    servers: [
                      ...draft.servers,
                      {
                        id: crypto.randomUUID(),
                        name: `节点 ${draft.servers.length + 1}`,
                        host: "",
                        port: "22",
                        username: "deployer",
                        authentication: "password",
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                添加服务器
              </Button>
              <div className="form-section-title">
                <h3>共用路径</h3>
                <p>当前环境只维护一份部署路径，所有节点使用相同路径。</p>
              </div>
              <div className="form-grid">
                <Field label="部署路径（所有服务器共用）" required>
                  {input("deployPath")}
                </Field>
                <Field label="服务器备份目录">
                  {input("backupPath", false)}
                </Field>
              </div>
              <Note>
                当前发布仅触发 Jenkins，工具不使用这些 SSH 连接执行部署命令。
              </Note>
            </>
          )}
          {tab === "mysql" && (
            <>
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void post(`/environments/${environment.id}/check`, {
                    kind: "mysql",
                  })
                    .then((result) =>
                      notify(`MySQL 连接成功，版本 ${result.version}`),
                    )
                    .catch((error) => notify(error.message))
                    .finally(() => setBusy(false));
                }}
              >
                检查已保存数据库连接
              </Button>
              <div className="form-section-title">
                <h3>单一 MySQL 连接</h3>
                <p>当前环境的服务器共用这一个数据库连接。</p>
              </div>
              <div className="form-grid">
                <Field label="数据库地址">{input("dbHost")}</Field>
                <Field label="数据库端口">{input("dbPort")}</Field>
                <Field label="数据库名称">{input("database")}</Field>
                <Field label="数据库账号">{input("dbUser")}</Field>
                <Field label="数据库密码">{secret("database")}</Field>
                <Field label="数据库类型">
                  <input value="MySQL" readOnly />
                </Field>
              </div>
              <Note>
                此处保存连接资料。每个版本在「数据库脚本」维护 SQL
                变化，由人工执行；发布流程不连接数据库。
              </Note>
            </>
          )}
          {tab === "jobs" && (
            <>
              <div className="form-section-title">
                <h3>环境 × 服务 → Jenkins Job</h3>
                <p>
                  填写已有任务路径；账号按服务类型引用全局设置，无需重复维护。
                </p>
              </div>
              {!services.length && (
                <Note>先到「服务管理」添加项目服务，再绑定任务。</Note>
              )}
              {services.map((service) => {
                const value = binding(service);
                const profile = profiles.find(
                  (p) =>
                    p.id ===
                    (service.kind === "前端应用" ? "frontend" : "backend"),
                );
                return (
                  <div className="job-binding-card" key={service.id}>
                    <div className="between">
                      <h3>{service.name}</h3>
                      <Button
                        disabled={
                          busy || !value.job || !profile?.credentialConfigured
                        }
                        onClick={() => {
                          setBusy(true);
                          void api(
                            `/jenkins/${profile?.id}/job?path=${encodeURIComponent(value.job)}`,
                          )
                            .then((result) => {
                              const definitions = result.parameters || [];
                              setMetadata((previous) => ({
                                ...previous,
                                [service.id]:
                                  definitions
                                    .map(
                                      (p: any) =>
                                        `${p.name}（${p.type || "参数"}）${p.choices?.length ? `：${p.choices.join(" / ")}` : ""}`,
                                    )
                                    .join("\n") || "任务未公开参数定义",
                              }));
                              const branch =
                                definitions.find(
                                  (p: any) => p.name === value.branchParameter,
                                ) ||
                                definitions.find((p: any) =>
                                  /branch|分支/i.test(p.name),
                                );
                              if (branch?.choices?.length)
                                updateBinding({
                                  ...value,
                                  supportsBranch: true,
                                  branchParameter: branch.name,
                                  branches: branch.choices.map(String),
                                  defaultBranch: branch.choices.includes(
                                    value.defaultBranch,
                                  )
                                    ? value.defaultBranch
                                    : String(
                                        branch.defaultValue ||
                                          branch.choices[0],
                                      ),
                                });
                              notify("已读取 Jenkins 参数，修改后请保存环境。");
                            })
                            .catch((error) => notify(error.message))
                            .finally(() => setBusy(false));
                        }}
                      >
                        读取 Job 参数
                      </Button>
                      <Badge tone="blue">{profile?.name} · 全局引用</Badge>
                    </div>
                    {metadata[service.id] && (
                      <pre className="job-metadata">{metadata[service.id]}</pre>
                    )}
                    <p className="muted small">
                      {profile?.url} · {profile?.username}
                    </p>
                    <div className="form-grid">
                      <Field
                        label="Job 路径"
                        hint="根任务填任务名；实际文件夹内填 folder/job；不包含 Jenkins 视图名。留空表示未绑定。"
                      >
                        <input
                          value={value.job}
                          onChange={(e) =>
                            updateBinding({ ...value, job: e.target.value })
                          }
                          placeholder="order/order-api-test"
                        />
                      </Field>
                      <Field
                        label="固定参数"
                        hint="每行一个 NAME=value，按实际 Job 填写。"
                      >
                        <textarea
                          rows={2}
                          value={value.parameters}
                          onChange={(e) =>
                            updateBinding({
                              ...value,
                              parameters: e.target.value,
                            })
                          }
                          placeholder="ENVIRONMENT=test"
                        />
                      </Field>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={value.supportsBranch}
                        onChange={(e) =>
                          updateBinding({
                            ...value,
                            supportsBranch: e.target.checked,
                          })
                        }
                      />
                      <span>此 Job 支持发布时选择分支</span>
                    </label>
                    {value.supportsBranch ? (
                      <div className="form-grid">
                        <Field label="分支参数名" required>
                          <input
                            required
                            value={value.branchParameter}
                            onChange={(e) =>
                              updateBinding({
                                ...value,
                                branchParameter: e.target.value,
                              })
                            }
                            placeholder="BRANCH / git_branch"
                          />
                        </Field>
                        <Field label="默认分支">
                          <select
                            value={value.defaultBranch}
                            onChange={(e) =>
                              updateBinding({
                                ...value,
                                defaultBranch: e.target.value,
                              })
                            }
                          >
                            {value.branches.map((branch) => (
                              <option key={branch}>{branch}</option>
                            ))}
                          </select>
                        </Field>
                        <Field
                          label="可选分支（每行一个）"
                          hint="可手动维护；Job 公开分支选项时可通过读取参数更新。插件未公开选项时需手动维护。"
                        >
                          <textarea
                            rows={3}
                            defaultValue={value.branches.join("\n")}
                            onChange={(e) => {
                              const branches = [
                                ...new Set(
                                  e.target.value
                                    .split("\n")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                ),
                              ];
                              updateBinding({
                                ...value,
                                branches,
                                defaultBranch: branches.includes(
                                  value.defaultBranch,
                                )
                                  ? value.defaultBranch
                                  : branches[0] || "",
                              });
                            }}
                          />
                        </Field>
                      </div>
                    ) : (
                      <p className="muted small">
                        发布时使用 Job 自身配置，不额外传分支参数。
                      </p>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {tab === "files" && (
            <>
              <div className="form-section-title">
                <h3>环境路径资料</h3>
                <p>供人工操作时查看；工具发布时不上传或替换文件。</p>
              </div>
              <div className="form-grid">
                <Field label="共用部署路径">{input("deployPath")}</Field>
                <Field label="配置文件目录">{input("configPath", false)}</Field>
                <Field label="服务器备份目录">
                  {input("backupPath", false)}
                </Field>
              </div>
              <Note>
                版本配置文件由人工更新。Nacos
                同步属于后续能力，当前没有自动同步。
              </Note>
            </>
          )}
        </div>
        <div className="panel-footer">
          <span className="muted small">资料与加密凭据保存在本机</span>
          <Button type="submit" variant="primary" disabled={busy}>
            <Save size={14} />
            保存环境配置
          </Button>
        </div>
      </form>
    </section>
  );
}
