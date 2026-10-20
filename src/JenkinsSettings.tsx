import { useState } from "react";
import { KeyRound, Save, Workflow } from "lucide-react";
import type { JenkinsProfile } from "./types";
import { Badge, Button, Field, Note } from "./ui";

export default function JenkinsSettings({
  profiles,
  onSave,
  notify,
}: {
  profiles: JenkinsProfile[];
  onSave: (value: JenkinsProfile[]) => void;
  notify: (value: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <h1>
            Jenkins 设置<span className="subtle-tag">全局共享</span>
          </h1>
          <p>所有项目和环境共用两套 Jenkins 连接，服务按类型引用。</p>
        </div>
      </div>
      <div className="jenkins-grid">
        {profiles.map((profile) => (
          <JenkinsCard
            key={profile.id}
            profile={profile}
            onSave={(value) =>
              onSave(profiles.map((p) => (p.id === value.id ? value : p)))
            }
            notify={notify}
          />
        ))}
      </div>
      <Note>
        这里维护地址和凭据；各项目的 Job 与参数在「环境连接 →
        服务发布任务」绑定。当前仅为前端演示，不连接 Jenkins。
      </Note>
    </>
  );
}

function JenkinsCard({
  profile,
  onSave,
  notify,
}: {
  profile: JenkinsProfile;
  onSave: (value: JenkinsProfile) => void;
  notify: (value: string) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [token, setToken] = useState("");
  return (
    <form
      className="panel jenkins-card"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...draft,
          credentialConfigured: profile.credentialConfigured || !!token,
        });
        setToken("");
        notify(
          "全局 Jenkins 配置已在样稿中更新，Token 输入已清空；没有保存真实凭据。",
        );
      }}
    >
      <div className="panel-heading">
        <div className="inline">
          <span className="component-icon">
            <Workflow size={22} />
          </span>
          <div>
            <h2>{profile.name}</h2>
            <p>
              {profile.id === "frontend"
                ? "供所有前端应用使用"
                : "供所有后端服务使用"}
            </p>
          </div>
        </div>
        <Badge tone="gray">共享配置</Badge>
      </div>
      <div className="editor-form">
        <Field label="Jenkins 地址" required>
          <input
            type="url"
            required
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        </Field>
        <Field label="Jenkins 账号" required>
          <input
            required
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
          />
        </Field>
        <Field
          label="API Token"
          hint="样稿不持久化 Token；输入只用于表单演示，保存后清空。"
        >
          <input
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              profile.credentialConfigured
                ? "已有示例凭据，留空不修改"
                : "输入 Token（仅演示）"
            }
          />
        </Field>
        <div className="inline muted small">
          <KeyRound size={14} />
          {profile.credentialConfigured
            ? "示例凭据：已配置（无真实 Token）"
            : "尚未配置凭据"}
        </div>
      </div>
      <div className="panel-footer">
        <span className="muted small">不随项目切换</span>
        <Button type="submit" variant="primary">
          <Save size={14} />
          保存全局配置
        </Button>
      </div>
    </form>
  );
}
