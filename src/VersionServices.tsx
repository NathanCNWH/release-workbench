import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { Service } from "./types";
import { Badge, Button, Empty } from "./ui";

export function VersionServiceEditor({
  services,
  selected,
  onSave,
  disabled,
}: {
  services: Service[];
  selected: string[];
  onSave: (ids: string[]) => Promise<void>;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(selected),
    [base, setBase] = useState(JSON.stringify(selected)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const incoming = JSON.stringify(selected),
    dirty = JSON.stringify(draft) !== base,
    conflicting = incoming !== base && dirty;
  useEffect(() => {
    if (incoming !== base && !dirty) {
      setDraft(selected);
      setBase(incoming);
    }
  }, [incoming, base, dirty, selected]);
  return (
    <>
      {conflicting && (
        <div className="error-message" role="alert">
          版本服务范围已在其他窗口更新。
          <Button
            onClick={() => {
              setDraft(selected);
              setBase(incoming);
              setError("");
            }}
          >
            加载最新范围并放弃当前修改
          </Button>
        </div>
      )}
      <VersionServices
        services={services}
        selected={draft}
        onChange={setDraft}
        disabled={disabled || busy}
      />
      <div className="version-service-save">
        <span className="muted small">
          {dirty ? "有尚未保存的服务选择" : "服务范围已保存；可暂时留空"}
        </span>
        <Button
          variant="primary"
          disabled={disabled || busy || !dirty || conflicting}
          onClick={() => {
            setBusy(true);
            setError("");
            void onSave(draft)
              .then(() => setBase(JSON.stringify(draft)))
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "正在保存…" : "保存涉及服务"}
        </Button>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

export default function VersionServices({
  services,
  selected,
  onChange,
  disabled = false,
  compact = false,
}: {
  services: Service[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = services.filter((service) =>
    (service.name + service.repository)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const toggle = (id: string, checked: boolean) =>
    onChange(
      services
        .filter((s) => (s.id === id ? checked : selected.includes(s.id)))
        .map((s) => s.id),
    );
  return (
    <div className={`version-services-picker ${compact ? "compact" : ""}`}>
      <div className="version-service-toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            aria-label="搜索涉及服务"
            placeholder="搜索服务名称或仓库"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="inline">
          <span className="muted small">
            已选 {selected.length} / {services.length}
          </span>
          <Button
            disabled={disabled}
            onClick={() => onChange(services.map((s) => s.id))}
          >
            全选
          </Button>
          <Button
            disabled={disabled || !selected.length}
            onClick={() => onChange([])}
          >
            清空
          </Button>
        </div>
      </div>
      <div className="version-services-grid">
        {visible.map((service) => (
          <label
            className={`version-service-choice ${selected.includes(service.id) ? "selected" : ""}`}
            key={service.id}
          >
            <input
              type="checkbox"
              name="serviceIds"
              value={service.id}
              checked={selected.includes(service.id)}
              disabled={disabled}
              onChange={(event) => toggle(service.id, event.target.checked)}
            />
            <span>
              <span className="inline">
                <strong>{service.name}</strong>
                <Badge tone={service.kind === "前端应用" ? "blue" : "green"}>
                  {service.kind}
                </Badge>
              </span>
              <code>{service.repository}</code>
            </span>
          </label>
        ))}
      </div>
      {!visible.length && (
        <Empty
          title={services.length ? "未找到服务" : "项目尚无服务"}
          detail={
            services.length
              ? "试试其他关键词。"
              : "可先创建版本，稍后在服务管理添加服务。"
          }
        />
      )}
    </div>
  );
}
