import type { Dispatch, SetStateAction } from "react";
import type { Environment, JobBinding, Service } from "./types";
import { Button, Field, Note } from "./ui";
import { post } from "./api";

export const newBinding = (service: Service): JobBinding => ({
  serviceId: service.id,
  serverIds: [],
  job: "",
  parameters: "",
  supportsBranch: false,
  branchParameter: "BRANCH",
  branches: [service.defaultBranch],
  defaultBranch: service.defaultBranch,
});
export default function ServiceHosts({
  draft,
  saved,
  services,
  setDraft,
  secrets,
  setSecrets,
  busy,
  setBusy,
  notify,
}: {
  draft: Environment;
  saved: Environment;
  services: Service[];
  setDraft: Dispatch<SetStateAction<Environment>>;
  secrets: Record<string, string>;
  setSecrets: Dispatch<SetStateAction<Record<string, string>>>;
  busy: boolean;
  setBusy: (value: boolean) => void;
  notify: (message: string) => void;
}) {
  const assigned = new Set(draft.bindings.flatMap((b) => b.serverIds || []));
  const setHost = (id: string, patch: Record<string, string>) =>
    setDraft((old) => ({
      ...old,
      servers: old.servers.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    }));
  function assign(service: Service, serverId: string, checked: boolean) {
    setDraft((old) => {
      const binding =
        old.bindings.find((b) => b.serviceId === service.id) ||
        newBinding(service);
      const serverIds = checked
        ? [...new Set([...(binding.serverIds || []), serverId])]
        : (binding.serverIds || []).filter((id) => id !== serverId);
      return {
        ...old,
        bindings: [
          ...old.bindings.filter((b) => b.serviceId !== service.id),
          { ...binding, serverIds },
        ],
      };
    });
  }
  return (
    <>
      <div className="form-section-title">
        <h3>服务主机</h3>
        <p>
          每个服务分别选择多台主机；同一主机可以被多个服务复用。主机资料不作为
          Jenkins 触发参数。
        </p>
      </div>
      {!services.length && (
        <Note>请先在项目“服务管理”添加服务，再登记其主机。</Note>
      )}
      {services.map((service) => {
        const ids =
          draft.bindings.find((b) => b.serviceId === service.id)?.serverIds ||
          [];
        return (
          <section className="service-host-card" key={service.id}>
            <div className="between">
              <h3>
                {service.name} · {ids.length} 台主机
              </h3>
              <Button
                onClick={() => {
                  const id = crypto.randomUUID();
                  setDraft((old) => {
                    const binding =
                      old.bindings.find((b) => b.serviceId === service.id) ||
                      newBinding(service);
                    return {
                      ...old,
                      servers: [
                        ...old.servers,
                        {
                          id,
                          name: `${service.name} 节点 ${ids.length + 1}`,
                          host: "",
                          port: "22",
                          username: "",
                          authentication: "environment",
                        },
                      ],
                      bindings: [
                        ...old.bindings.filter(
                          (b) => b.serviceId !== service.id,
                        ),
                        {
                          ...binding,
                          serverIds: [...(binding.serverIds || []), id],
                        },
                      ],
                    };
                  });
                }}
              >
                新增主机并关联 · {service.name}
              </Button>
            </div>
            <div className="host-choices">
              {draft.servers.map((server) => (
                <label key={server.id} className="checkbox">
                  <input
                    type="checkbox"
                    checked={ids.includes(server.id)}
                    onChange={(event) =>
                      assign(service, server.id, event.target.checked)
                    }
                  />
                  <span>
                    {server.name} <code>{server.host || "待填地址"}</code>
                  </span>
                </label>
              ))}
            </div>
            {!draft.servers.length && (
              <p className="muted small">尚无主机，点击上方按钮添加。</p>
            )}
          </section>
        );
      })}
      {!!draft.servers.filter((server) => !assigned.has(server.id)).length && (
        <Note>
          有 {draft.servers.filter((server) => !assigned.has(server.id)).length}{" "}
          台主机尚未关联服务。旧版资料已保留，请在上方选择归属，不会自动分配。
        </Note>
      )}
      {!!draft.servers.length && (
        <div className="form-section-title">
          <h3>关联主机资料</h3>
          <p>修改下列资料会应用于引用该主机的所有服务，保存环境后生效。</p>
        </div>
      )}
      {draft.servers.map((server) => (
        <section className="server-edit-card" key={server.id}>
          <div className="between">
            <h3>{server.name}</h3>
            <Button
              disabled={busy || !saved.servers.some((s) => s.id === server.id)}
              onClick={() => {
                setBusy(true);
                void post(`/environments/${saved.id}/check`, {
                  kind: "ssh",
                  serverId: server.id,
                })
                  .then((result) =>
                    notify(`SSH 连接成功，主机指纹：${result.fingerprint}`),
                  )
                  .catch((error) => notify(error.message))
                  .finally(() => setBusy(false));
              }}
            >
              检查已保存连接
            </Button>
            <Button
              aria-label={`移除主机 ${server.name}`}
              onClick={() =>
                setDraft((old) => ({
                  ...old,
                  servers: old.servers.filter((s) => s.id !== server.id),
                  bindings: old.bindings.map((b) => ({
                    ...b,
                    serverIds: (b.serverIds || []).filter(
                      (id) => id !== server.id,
                    ),
                  })),
                }))
              }
            >
              移除主机
            </Button>
          </div>
          <p className="muted small">
            所属服务：
            {services
              .filter((service) =>
                draft.bindings.some(
                  (b) =>
                    b.serviceId === service.id &&
                    b.serverIds?.includes(server.id),
                ),
              )
              .map((service) => service.name)
              .join("、") || "待关联"}
          </p>
          <div className="form-grid">
            {(
              [
                { key: "name", label: "主机名称" },
                { key: "host", label: "主机地址" },
                { key: "port", label: "SSH 端口" },
              ] as const
            ).map((field) => (
              <Field label={field.label} key={field.key} required>
                <input
                  required
                  value={server[field.key]}
                  onChange={(event) =>
                    setHost(server.id, { [field.key]: event.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="认证方式">
              <select
                value={server.authentication}
                onChange={(event) => {
                  setHost(server.id, {
                    authentication: event.target.value,
                    ...(event.target.value === "environment"
                      ? { username: "" }
                      : {}),
                  });
                  setSecrets((old) => ({ ...old, [server.id]: "" }));
                }}
              >
                <option value="environment">SSH_NAME / SSH_PWD 环境变量</option>
                <option value="password">账号密码</option>
                <option value="key">SSH 私钥</option>
              </select>
            </Field>
            {server.authentication === "environment" ? (
              <Note>
                登录账号和密码直接读取启动进程中的 SSH_NAME /
                SSH_PWD，无需填写。
              </Note>
            ) : (
              <>
                <Field label="登录账号" required>
                  <input
                    required
                    value={server.username}
                    onChange={(event) =>
                      setHost(server.id, { username: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label={
                    server.authentication === "key" ? "SSH 私钥" : "登录密码"
                  }
                >
                  {server.authentication === "key" ? (
                    <textarea
                      rows={5}
                      value={secrets[server.id] || ""}
                      autoComplete="off"
                      placeholder="粘贴完整私钥，保留换行；留空不修改"
                      onChange={(event) =>
                        setSecrets((old) => ({
                          ...old,
                          [server.id]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <input
                      type="password"
                      value={secrets[server.id] || ""}
                      autoComplete="new-password"
                      placeholder="留空不修改；加密保存在本机"
                      onChange={(event) =>
                        setSecrets((old) => ({
                          ...old,
                          [server.id]: event.target.value,
                        }))
                      }
                    />
                  )}
                </Field>
              </>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
