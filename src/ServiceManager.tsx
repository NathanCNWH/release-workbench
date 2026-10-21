import { useState } from "react";
import { Code2, GitBranch, Plus, Trash2 } from "lucide-react";
import type { Service } from "./types";
import { Badge, Button, Empty, Field, Modal, Note } from "./ui";

export const newService = (): Service => ({
  id: crypto.randomUUID(),
  name: "",
  repository: "",
  defaultBranch: "main",
  kind: "后端服务",
});

export function ServiceFields({
  value,
  onChange,
}: {
  value: Service;
  onChange: (value: Service) => void;
}) {
  const change = (key: keyof Service, text: string) =>
    onChange({ ...value, [key]: text });
  return (
    <div className="form-grid">
      <Field label="服务名称" required>
        <input
          value={value.name}
          required
          onChange={(e) => change("name", e.target.value)}
          placeholder="例如：order-api"
        />
      </Field>
      <Field label="服务类型">
        <select
          value={value.kind}
          onChange={(e) => change("kind", e.target.value)}
        >
          <option>后端服务</option>
          <option>前端应用</option>
        </select>
      </Field>
      <Field label="Git 地址" required>
        <input
          value={value.repository}
          required
          onChange={(e) => change("repository", e.target.value)}
          placeholder="git@example.com:team/service.git"
        />
      </Field>
      <Field
        label="默认分支"
        required
        hint="仅预填新环境任务的分支；实际发布以任务设置或当次选择为准，不修改 Git。"
      >
        <input
          value={value.defaultBranch}
          required
          onChange={(e) => change("defaultBranch", e.target.value)}
        />
      </Field>
    </div>
  );
}

export function ProjectServiceFields({
  services,
  onChange,
}: {
  services: Service[];
  onChange: (value: Service[]) => void;
}) {
  return (
    <div className="project-service-fields">
      <div className="between">
        <h3>项目服务</h3>
        <Button onClick={() => onChange([...services, newService()])}>
          <Plus size={14} />
          添加服务
        </Button>
      </div>
      <p className="muted small">
        在这里维护 Git 和默认分支，发布时直接选择。也可先创建项目，稍后补充。
      </p>
      {services.map((service, index) => (
        <div className="service-edit-row" key={service.id}>
          <div className="between">
            <strong>服务 {index + 1}</strong>
            <Button
              aria-label={`移除服务 ${index + 1}`}
              onClick={() =>
                onChange(services.filter((s) => s.id !== service.id))
              }
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <ServiceFields
            value={service}
            onChange={(value) =>
              onChange(services.map((s) => (s.id === value.id ? value : s)))
            }
          />
        </div>
      ))}
    </div>
  );
}

export default function ServiceManager({
  services,
  onSave,
  notify,
}: {
  services: Service[];
  onSave: (value: Service[]) => void;
  notify: (value: string) => void;
}) {
  const [draft, setDraft] = useState<Service | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROJECT SERVICES</div>
          <h1>服务管理</h1>
          <p>项目的服务与 Git 清单，供发布选择和环境任务绑定引用。</p>
        </div>
        <Button variant="primary" onClick={() => setDraft(newService())}>
          <Plus size={16} />
          添加服务
        </Button>
      </div>
      <div className="service-catalog">
        {services.map((service) => (
          <article className="panel catalog-card" key={service.id}>
            <div className="between">
              <span className="component-icon">
                <Code2 size={22} />
              </span>
              <Badge tone={service.kind === "前端应用" ? "blue" : "green"}>
                {service.kind}
              </Badge>
            </div>
            <h2>{service.name}</h2>
            <code className="repository-text">{service.repository}</code>
            <div className="catalog-footer">
              <span className="inline muted">
                <GitBranch size={14} />
                {service.defaultBranch}
              </span>
              <Button onClick={() => setDraft({ ...service })}>编辑服务</Button>
            </div>
          </article>
        ))}
        {!services.length && (
          <section className="panel">
            <Empty
              title="还没有服务"
              detail="先添加服务及 Git 地址，再在版本或发布中选择。"
              action={
                <Button onClick={() => setDraft(newService())}>添加服务</Button>
              }
            />
          </section>
        )}
      </div>
      <Note>
        前端服务引用全局「前端 Jenkins」，后端服务引用全局「后端 Jenkins」。Job
        和参数在「环境连接 → 服务发布任务」维护。
      </Note>
      {draft && (
        <Modal
          title={
            services.some((s) => s.id === draft.id)
              ? "编辑项目服务"
              : "添加项目服务"
          }
          onClose={() => setDraft(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = {
                ...draft,
                name: draft.name.trim(),
                repository: draft.repository.trim(),
                defaultBranch: draft.defaultBranch.trim(),
              };
              if (!value.name || !value.repository || !value.defaultBranch)
                return notify("请填写完整的服务资料。");
              if (
                services.some((s) => s.id !== value.id && s.name === value.name)
              )
                return notify("当前项目已存在同名服务。");
              onSave(
                services.some((s) => s.id === value.id)
                  ? services.map((s) => (s.id === value.id ? value : s))
                  : [...services, value],
              );
              setDraft(null);
              notify("项目服务已提交保存。");
            }}
          >
            <div className="modal-body">
              <ServiceFields value={draft} onChange={setDraft} />
            </div>
            <div className="modal-footer">
              <Button onClick={() => setDraft(null)}>取消</Button>
              <Button type="submit" variant="primary">
                保存服务
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
