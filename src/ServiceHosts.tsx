import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Link2, Plus, Server, Unplug } from "lucide-react";
import type {
  Environment,
  JobBinding,
  ServerConnection,
  Service,
} from "./types";
import { Button, Field, Modal, Note } from "./ui";
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
type Props = {
  draft: Environment;
  saved: Environment;
  services: Service[];
  setDraft: Dispatch<SetStateAction<Environment>>;
  secrets: Record<string, string>;
  setSecrets: Dispatch<SetStateAction<Record<string, string>>>;
  busy: boolean;
  setBusy: (value: boolean) => void;
  notify: (message: string) => void;
};
type Point = { x: number; y: number };
type Wire = { serviceId: string; serverId: string; path: string };
const curve = (a: Point, b: Point) => {
  const d = Math.max(35, (b.x - a.x) * 0.5);
  return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`;
};

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
}: Props) {
  const graph = useRef<HTMLDivElement>(null),
    servicePorts = useRef(new Map<string, HTMLButtonElement>()),
    hostPorts = useRef(new Map<string, HTMLButtonElement>());
  const [activeService, setActiveService] = useState<string | null>(null),
    [selected, setSelected] = useState<[string, string] | null>(null),
    [ghost, setGhost] = useState<Point | null>(null),
    [wires, setWires] = useState<Wire[]>([]);
  const [editor, setEditor] = useState<ServerConnection | null>(null),
    [original, setOriginal] = useState(""),
    [secret, setSecret] = useState(""),
    [originalSecret, setOriginalSecret] = useState("");
  const assigned = new Set(draft.bindings.flatMap((b) => b.serverIds || []));
  const anchor = (element?: HTMLButtonElement | null): Point | null => {
    if (!element || !graph.current) return null;
    const r = element.getBoundingClientRect(),
      g = graph.current.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - g.left,
      y: r.top + r.height / 2 - g.top,
    };
  };
  useLayoutEffect(() => {
    const update = () =>
      setWires(
        draft.bindings.flatMap((b) =>
          (b.serverIds || []).flatMap((id) => {
            const a = anchor(servicePorts.current.get(b.serviceId)),
              z = anchor(hostPorts.current.get(id));
            return a && z
              ? [{ serviceId: b.serviceId, serverId: id, path: curve(a, z) }]
              : [];
          }),
        ),
      );
    update();
    const observer = new ResizeObserver(update);
    if (graph.current) {
      observer.observe(graph.current);
      for (const child of graph.current.querySelectorAll(".host-graph-column"))
        observer.observe(child);
    }
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [draft.bindings, draft.servers, services]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveService(null);
        setSelected(null);
        setGhost(null);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  function connect(serviceId: string, serverId: string) {
    const service = services.find((s) => s.id === serviceId);
    if (!service || !draft.servers.some((s) => s.id === serverId)) return;
    if (
      draft.bindings.some(
        (b) => b.serviceId === serviceId && b.serverIds?.includes(serverId),
      )
    )
      notify("这项关联已经存在。");
    else
      setDraft((old) => {
        const binding =
          old.bindings.find((b) => b.serviceId === serviceId) ||
          newBinding(service);
        return {
          ...old,
          bindings: [
            ...old.bindings.filter((b) => b.serviceId !== serviceId),
            {
              ...binding,
              serverIds: [...new Set([...(binding.serverIds || []), serverId])],
            },
          ],
        };
      });
    setActiveService(null);
    setGhost(null);
    setSelected(null);
  }
  function openEditor(server?: ServerConnection) {
    const value = server
      ? { ...server }
      : {
          id: crypto.randomUUID(),
          name: "",
          host: "",
          port: "22",
          username: "",
          authentication: "environment" as const,
        };
    setEditor(value);
    setOriginal(JSON.stringify(value));
    setSecret(secrets[value.id] || "");
    setOriginalSecret(secrets[value.id] || "");
  }
  function closeEditor() {
    if (
      editor &&
      (JSON.stringify(editor) !== original || secret !== originalSecret) &&
      !window.confirm("放弃尚未保存的主机修改？")
    )
      return;
    setEditor(null);
  }
  const selectedService = services.find((s) => s.id === selected?.[0]),
    selectedHost = draft.servers.find((s) => s.id === selected?.[1]);
  const ghostStart = activeService
    ? anchor(servicePorts.current.get(activeService))
    : null;
  return (
    <>
      <div className="form-section-title host-graph-title">
        <div>
          <h3>服务与主机</h3>
          <p>主机独立维护，通过连线关联服务。同一主机可供多个服务使用。</p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus size={15} />
          新增主机
        </Button>
      </div>
      <div className="host-graph-instruction" role="status">
        {activeService
          ? `正在连接「${services.find((s) => s.id === activeService)?.name}」，拖到或点击右侧主机连接点；Esc 取消。`
          : "拖动服务连接点到主机，或依次点击两端；点击连线可以解除关联。"}
      </div>
      <div className="host-graph-scroll">
        <div
          className="host-graph"
          ref={graph}
          onPointerMove={(event) => {
            if (activeService && event.buttons && graph.current) {
              const r = graph.current.getBoundingClientRect();
              setGhost({ x: event.clientX - r.left, y: event.clientY - r.top });
            }
          }}
          onPointerUp={(event) => {
            if (!activeService) return;
            const host = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>("[data-host-id]");
            if (host?.dataset.hostId)
              connect(activeService, host.dataset.hostId);
            setGhost(null);
          }}
          onPointerCancel={() => {
            setActiveService(null);
            setGhost(null);
          }}
        >
          <svg className="host-wires" aria-label="服务主机关联线">
            {wires.map((w) => (
              <path
                key={`${w.serviceId}:${w.serverId}`}
                d={w.path}
                className={
                  selected?.[0] === w.serviceId && selected?.[1] === w.serverId
                    ? "selected"
                    : ""
                }
                onClick={() => {
                  setSelected([w.serviceId, w.serverId]);
                  setActiveService(null);
                }}
              />
            ))}
            {ghost && ghostStart && (
              <path d={curve(ghostStart, ghost)} className="ghost" />
            )}
          </svg>
          <div className="host-graph-column">
            <div className="host-column-heading">
              项目服务 <span>{services.length} 项</span>
            </div>
            {services.map((service) => (
              <div
                className={`host-service-node ${activeService === service.id ? "selected" : ""}`}
                key={service.id}
              >
                <div>
                  <strong>{service.name}</strong>
                  <small>
                    {draft.bindings.find((b) => b.serviceId === service.id)
                      ?.serverIds?.length || 0}{" "}
                    台主机
                  </small>
                </div>
                <span
                  className={`badge badge-${service.kind === "前端应用" ? "blue" : "green"}`}
                >
                  {service.kind}
                </span>
                <button
                  type="button"
                  className="host-port service-port"
                  ref={(element) => {
                    if (element) servicePorts.current.set(service.id, element);
                    else servicePorts.current.delete(service.id);
                  }}
                  aria-label={`关联服务 ${service.name}`}
                  aria-pressed={activeService === service.id}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setActiveService(service.id);
                    setSelected(null);
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) {
                      setActiveService(service.id);
                      setSelected(null);
                    }
                  }}
                />
              </div>
            ))}
            {!services.length && (
              <p className="muted small">项目尚无服务，可先新增主机。</p>
            )}
          </div>
          <div />
          <div className="host-graph-column">
            <div className="host-column-heading">
              环境主机 <span>{draft.servers.length} 台</span>
            </div>
            {draft.servers.map((server) => (
              <div
                className={`host-server-node ${assigned.has(server.id) ? "" : "unassigned"}`}
                key={server.id}
                data-host-id={server.id}
              >
                <button
                  type="button"
                  className="host-port server-port"
                  ref={(element) => {
                    if (element) hostPorts.current.set(server.id, element);
                    else hostPorts.current.delete(server.id);
                  }}
                  aria-label={`关联主机 ${server.name}`}
                  onClick={(event) => {
                    if (event.detail === 0) {
                      if (activeService) connect(activeService, server.id);
                      else notify("请先选择左侧服务的连接点。");
                    }
                  }}
                />
                <div className="between">
                  <strong>{server.name}</strong>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openEditor(server)}
                  >
                    编辑
                  </button>
                </div>
                <code>
                  {server.host}:{server.port}
                </code>
                <div className="host-server-meta">
                  <span>
                    {draft.bindings.filter((b) =>
                      b.serverIds?.includes(server.id),
                    ).length
                      ? `关联 ${draft.bindings.filter((b) => b.serverIds?.includes(server.id)).length} 个服务`
                      : "尚未关联"}
                  </span>
                  <span>
                    {server.authentication === "environment"
                      ? "环境变量认证"
                      : server.authentication === "key"
                        ? "私钥认证"
                        : "账号密码认证"}
                  </span>
                </div>
              </div>
            ))}
            {!draft.servers.length && (
              <div className="host-empty">
                <Server size={28} />
                <p>还没有主机</p>
                <Button onClick={() => openEditor()}>独立新增主机</Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="host-graph-footer">
        <span>
          {wires.length} 项关联 ·{" "}
          {draft.servers.filter((s) => !assigned.has(s.id)).length} 台主机未关联
        </span>
        <div className="inline">
          <span>
            {selectedService && selectedHost
              ? `${selectedService.name} → ${selectedHost.name}`
              : "选中连线后可解除关联"}
          </span>
          <Button
            disabled={!selectedService || !selectedHost}
            onClick={() => {
              if (!selected) return;
              setDraft((old) => ({
                ...old,
                bindings: old.bindings.map((b) =>
                  b.serviceId === selected[0]
                    ? {
                        ...b,
                        serverIds: (b.serverIds || []).filter(
                          (id) => id !== selected[1],
                        ),
                      }
                    : b,
                ),
              }));
              setSelected(null);
            }}
          >
            <Unplug size={14} />
            解除关联
          </Button>
        </div>
      </div>
      <p className="muted small host-graph-note">
        <Link2 size={13} />
        关联在保存环境后生效；主机资料不作为 Jenkins 触发参数。
      </p>
      {editor &&
        createPortal(
          <Modal
            title={
              draft.servers.some((s) => s.id === editor.id)
                ? "编辑主机"
                : "新增主机"
            }
            subtitle="主机可以独立保存，之后再关联服务。"
            onClose={closeEditor}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const value = {
                  ...editor,
                  name: editor.name.trim(),
                  host: editor.host.trim(),
                  username:
                    editor.authentication === "environment"
                      ? ""
                      : editor.username.trim(),
                };
                if (
                  !value.name ||
                  !value.host ||
                  !/^[0-9]+$/.test(value.port) ||
                  +value.port < 1 ||
                  +value.port > 65535
                )
                  return notify("请填写主机名称、地址及有效端口。");
                setDraft((old) => ({
                  ...old,
                  servers: old.servers.some((s) => s.id === value.id)
                    ? old.servers.map((s) => (s.id === value.id ? value : s))
                    : [...old.servers, value],
                }));
                setSecrets((old) => ({
                  ...old,
                  [value.id]:
                    value.authentication === "environment" ? "" : secret,
                }));
                setEditor(null);
              }}
            >
              <div className="modal-body">
                <div className="form-grid">
                  {(["name", "host", "port"] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        {
                          name: "主机名称",
                          host: "主机地址",
                          port: "SSH 端口",
                        }[key]
                      }
                      required
                    >
                      <input
                        required
                        value={editor[key]}
                        onChange={(event) =>
                          setEditor({ ...editor, [key]: event.target.value })
                        }
                      />
                    </Field>
                  ))}
                  <Field label="认证方式">
                    <select
                      value={editor.authentication}
                      onChange={(event) => {
                        setEditor({
                          ...editor,
                          authentication: event.target
                            .value as ServerConnection["authentication"],
                          ...(event.target.value === "environment"
                            ? { username: "" }
                            : {}),
                        });
                        setSecret("");
                      }}
                    >
                      <option value="environment">
                        SSH_NAME / SSH_PWD 环境变量
                      </option>
                      <option value="password">账号密码</option>
                      <option value="key">SSH 私钥</option>
                    </select>
                  </Field>
                  {editor.authentication === "environment" ? (
                    <Note>
                      账号和密码读取启动进程的 SSH_NAME / SSH_PWD，无需填写。
                    </Note>
                  ) : (
                    <>
                      <Field label="登录账号" required>
                        <input
                          required
                          value={editor.username}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              username: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        label={
                          editor.authentication === "key"
                            ? "SSH 私钥"
                            : "登录密码"
                        }
                      >
                        {editor.authentication === "key" ? (
                          <textarea
                            rows={5}
                            autoComplete="off"
                            placeholder="粘贴完整私钥；留空不修改已保存凭据"
                            value={secret}
                            onChange={(event) => setSecret(event.target.value)}
                          />
                        ) : (
                          <input
                            type="password"
                            autoComplete="new-password"
                            placeholder="留空不修改已保存凭据"
                            value={secret}
                            onChange={(event) => setSecret(event.target.value)}
                          />
                        )}
                      </Field>
                    </>
                  )}
                </div>
                {draft.servers.some((s) => s.id === editor.id) && (
                  <div className="host-editor-actions">
                    <Button
                      disabled={
                        busy || !saved.servers.some((s) => s.id === editor.id)
                      }
                      onClick={() => {
                        setBusy(true);
                        void post(`/environments/${saved.id}/check`, {
                          kind: "ssh",
                          serverId: editor.id,
                        })
                          .then(() => notify("已保存的 SSH 连接验证成功。"))
                          .catch((error) => notify(error.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      检查已保存连接
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        const count = draft.bindings.filter((b) =>
                          b.serverIds?.includes(editor.id),
                        ).length;
                        if (
                          !window.confirm(
                            `删除主机「${editor.name}」？${count ? `同时解除 ${count} 个服务关联。` : ""}保存环境后生效。`,
                          )
                        )
                          return;
                        setDraft((old) => ({
                          ...old,
                          servers: old.servers.filter(
                            (s) => s.id !== editor.id,
                          ),
                          bindings: old.bindings.map((b) => ({
                            ...b,
                            serverIds: (b.serverIds || []).filter(
                              (id) => id !== editor.id,
                            ),
                          })),
                        }));
                        setSecrets((old) => {
                          const value = { ...old };
                          delete value[editor.id];
                          return value;
                        });
                        setSelected(null);
                        setEditor(null);
                      }}
                    >
                      删除主机
                    </Button>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <Button onClick={closeEditor}>取消</Button>
                <Button variant="primary" type="submit">
                  保存主机
                </Button>
              </div>
            </form>
          </Modal>,
          document.body,
        )}
    </>
  );
}
