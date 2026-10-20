import { useState } from "react";
import { KeyRound, Save, Workflow } from "lucide-react";
import type { JenkinsProfile } from "./types";
import { Badge, Button, Field, Note } from "./ui";
import { api, post } from "./api";
import { useWorkbench } from "./state";

export default function JenkinsSettings({
  profiles,
  notify,
}: {
  profiles: JenkinsProfile[];
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
          <JenkinsCard key={profile.id} profile={profile} notify={notify} />
        ))}
      </div>
      <Note>
        这里维护地址和凭据；各项目的 Job 与参数在「环境连接 →
        服务发布任务」绑定。连接检查不会触发构建。
      </Note>
    </>
  );
}

function JenkinsCard({
  profile,
  notify,
}: {
  profile: JenkinsProfile;
  notify: (value: string) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const workbench = useWorkbench();
  return (
    <form
      className="panel jenkins-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await workbench.update("jenkinsProfiles", (profiles) =>
            profiles.map((p) => (p.id === profile.id ? draft : p)),
          );
          if (token)
            await api("/credentials", {
              method: "PUT",
              body: JSON.stringify({ kind: "jenkins", id: profile.id, token }),
            });
          setToken("");
          await workbench.refresh();
          notify(token || profile.credentialConfigured ? "Jenkins 配置和加密凭据已保存。" : "Jenkins 地址和账号已保存，请补充 Token 后使用。");
        } catch (error: any) {
          notify(`保存失败：${error.message}`);
        } finally {
          setBusy(false);
        }
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
          hint="Token 加密保存在本机；留空保留原值，接口不会回传。"
        >
          <input
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              profile.credentialConfigured
                ? "已有凭据，留空不修改"
                : "输入 Jenkins API Token"
            }
          />
        </Field>
        <div className="inline muted small">
          <KeyRound size={14} />
          {profile.credentialConfigured ? "Token 已配置" : "尚未配置凭据"}
        </div>
      </div>
      <div className="panel-footer">
        <span className="muted small">不随项目切换</span>
        <Button
          disabled={busy || !profile.credentialConfigured}
          onClick={() => {
            setBusy(true);
            void post(`/jenkins/${profile.id}/check`)
              .then(() => notify("Jenkins 连接成功。"))
              .catch((e) => notify(`连接失败：${e.message}`))
              .finally(() => setBusy(false));
          }}
        >
          检查已保存连接
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          <Save size={14} />
          保存全局配置
        </Button>
      </div>
    </form>
  );
}
