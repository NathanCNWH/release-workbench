import { useState } from "react";
import {
  Cable,
  Database,
  FileText,
  KeyRound,
  Save,
  Server,
  Workflow,
} from "lucide-react";
import type { Environment } from "./types";
import { Badge, Button, Field, Note } from "./ui";

export default function EnvironmentEditor({
  environment,
  onSave,
  notify,
}: {
  environment: Environment;
  onSave: (value: Environment) => void;
  notify: (text: string) => void;
}) {
  const [tab, setTab] = useState("ssh");
  const [draft, setDraft] = useState(environment);
  const [authentication, setAuthentication] = useState("password");
  const [secret, setSecret] = useState("");
  const change = (key: keyof Environment, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const input = (key: keyof Environment, placeholder = "") => (
    <input
      value={draft[key]}
      onChange={(event) => change(key, event.target.value)}
      placeholder={placeholder}
      required
    />
  );
  const tabs = [
    { id: "ssh", name: "服务器 SSH", icon: Server },
    { id: "mysql", name: "MySQL 数据库", icon: Database },
    { id: "jenkins", name: "Jenkins 发布", icon: Workflow },
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
            <p>{environment.key} · Linux / MySQL</p>
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
              setSecret("");
            }}
          >
            <item.icon size={15} />
            {item.name}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
          setSecret("");
        }}
      >
        <div className="editor-form">
          {tab === "ssh" && (
            <>
              <div className="form-section-title">
                <h3>连接信息</h3>
                <p>维护服务器账号与路径，供发布时使用。</p>
              </div>
              <div className="form-grid">
                <Field label="服务器地址">{input("host")}</Field>
                <Field label="SSH 端口">{input("port")}</Field>
                <Field label="认证方式">
                  <select
                    value={authentication}
                    onChange={(event) => setAuthentication(event.target.value)}
                  >
                    <option value="password">账号密码</option>
                    <option value="environment">
                      SSH_NAME / SSH_PWD 环境变量
                    </option>
                    <option value="key">SSH 私钥</option>
                  </select>
                </Field>
                <Field label="登录账号">{input("username")}</Field>
                <Field
                  label={authentication === "key" ? "私钥内容" : "登录密码"}
                  hint="前端样稿仅在本次编辑时保留输入，不存入浏览器。"
                >
                  <input
                    type="password"
                    disabled={authentication === "environment"}
                    autoComplete="new-password"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder={
                      authentication === "environment"
                        ? "发布时读取进程环境变量"
                        : "输入以替换，留空表示不修改"
                    }
                  />
                </Field>
                <Field label="系统类型">
                  <input value="Linux" readOnly />
                </Field>
              </div>
              <div className="form-section-title">
                <h3>发布位置</h3>
                <p>各环境分别维护，版本复用时使用目标环境的路径。</p>
              </div>
              <div className="form-grid">
                <Field label="部署目录">{input("deployPath")}</Field>
                <Field label="服务器备份目录">{input("backupPath")}</Field>
              </div>
            </>
          )}
          {tab === "mysql" && (
            <>
              <div className="form-section-title">
                <h3>MySQL 连接</h3>
                <p>连接属于环境；SQL 脚本与变化清单属于版本。</p>
              </div>
              <div className="form-grid">
                <Field label="数据库地址">{input("dbHost")}</Field>
                <Field label="数据库端口">{input("dbPort")}</Field>
                <Field label="数据库名称">{input("database")}</Field>
                <Field label="数据库账号">{input("dbUser")}</Field>
                <Field label="数据库密码">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder="输入以替换，留空表示不修改"
                  />
                </Field>
                <Field label="数据库类型">
                  <input value="MySQL 8" readOnly />
                </Field>
              </div>
              <Note>
                此处维护连接信息。每个版本的增量 SQL、脚本内容及差异在「版本管理
                → 数据库脚本」中维护。
              </Note>
            </>
          )}
          {tab === "jenkins" && (
            <>
              <div className="form-section-title">
                <h3>发布任务</h3>
                <p>绑定已有 Jenkins Job，维护账密、任务路径与发布参数。</p>
              </div>
              <div className="form-grid">
                <Field label="Jenkins 地址">{input("jenkinsUrl")}</Field>
                <Field label="Jenkins 账号">{input("jenkinsUser")}</Field>
                <Field label="API Token 或凭据">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder="输入以替换，留空表示不修改"
                  />
                </Field>
                <Field label="Job 路径">{input("job")}</Field>
              </div>
              <div className="parameter-table">
                <div>
                  <b>参数名称</b>
                  <b>参数来源</b>
                  <b>示例值</b>
                </div>
                <div>
                  <code>RELEASE_VERSION</code>
                  <span>当前版本</span>
                  <code>20261020-02</code>
                </div>
                <div>
                  <code>GIT_COMMIT</code>
                  <span>版本固定提交</span>
                  <code>c71b3e8</code>
                </div>
                <div>
                  <code>DEPLOY_PATH</code>
                  <span>环境部署目录</span>
                  <code>{draft.deployPath}</code>
                </div>
                <div>
                  <code>ENVIRONMENT</code>
                  <span>当前环境</span>
                  <code>{draft.key}</code>
                </div>
              </div>
              <Note>
                这里展示参数映射方式。读取真实
                Job、触发发布和获取构建日志将在后端阶段实现。
              </Note>
            </>
          )}
          {tab === "files" && (
            <>
              <div className="form-section-title">
                <h3>文件目录</h3>
                <p>版本中的逻辑文件在发布时映射到当前环境。</p>
              </div>
              <div className="form-grid">
                <Field label="应用部署目录">{input("deployPath")}</Field>
                <Field label="配置文件目录">{input("configPath")}</Field>
                <Field label="服务器备份目录">{input("backupPath")}</Field>
                <Field label="本机备份目录">
                  <input
                    value={`D:\ReleaseWorkbench\data\backups\${environment.projectId}\${environment.key}`}
                    readOnly
                  />
                </Field>
              </div>
              <div className="nacos-note">
                <FileText size={24} />
                <div>
                  <h3>先管理文件，后续按需同步到 Nacos</h3>
                  <p>
                    后续配置 Namespace、Group 和 Data ID
                    后，可先比较内容，再推送到 Nacos。当前阶段不会自动同步。
                  </p>
                </div>
                <Badge>后续能力</Badge>
              </div>
            </>
          )}
        </div>
        <div className="panel-footer">
          <div className="muted inline">
            <KeyRound size={14} />
            <span>凭据输入只用于页面交互演示</span>
          </div>
          <div className="actions">
            <Button
              onClick={() =>
                notify("当前为前端样稿，未连接服务器、MySQL 或 Jenkins。")
              }
            >
              <Cable size={15} />
              连接检查（演示）
            </Button>
            <Button type="submit" variant="primary">
              <Save size={15} />
              保存页面配置
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
