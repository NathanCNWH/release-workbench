import type { Release, VersionMerge as Merge } from "./types";
import { Button, Note, downloadText } from "./ui";

export function VersionPicker({
  versions,
  selected,
  onChange,
  disabled,
}: {
  versions: Release[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  return (
    <section className="version-picker">
      <div className="between">
        <h3>选择版本 · 已选 {selected.length} 个</h3>
        <span className="muted small">可不选，直接发布服务</span>
      </div>
      <p className="muted small">
        勾选版本后汇总 SQL / 配置资料，保留原版本。下方顺序即合并顺序。
      </p>
      <div className="version-options">
        {versions.map((version) => (
          <label className="checkbox" key={version.id}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(version.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, version.id]
                    : selected.filter((id) => id !== version.id),
                )
              }
            />
            <span>
              <strong>{version.name}</strong> · {version.title}{" "}
              <small>{version.status}</small>
            </span>
          </label>
        ))}
      </div>
      {!!selected.length && (
        <ol className="version-order">
          {selected.map((id, index) => (
            <li key={id}>
              <span>{versions.find((v) => v.id === id)?.name || id}</span>
              <div>
                <Button
                  disabled={disabled || !index}
                  aria-label={`上移版本 ${index + 1}`}
                  onClick={() => {
                    const next = [...selected];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    onChange(next);
                  }}
                >
                  ↑
                </Button>
                <Button
                  disabled={disabled || index === selected.length - 1}
                  aria-label={`下移版本 ${index + 1}`}
                  onClick={() => {
                    const next = [...selected];
                    [next[index], next[index + 1]] = [
                      next[index + 1],
                      next[index],
                    ];
                    onChange(next);
                  }}
                >
                  ↓
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function VersionResources({
  merge,
  onResolve,
  disabled = false,
}: {
  merge: Merge;
  onResolve?: (key: string, id: string) => void;
  disabled?: boolean;
}) {
  if (!merge.versions.length) return null;
  return (
    <section className="version-resources">
      <h3>合并发布资料</h3>
      <p>
        {merge.versions.map((v) => v.name).join(" → ")} · {merge.scripts.length}{" "}
        个 SQL · {merge.configs.length} 个配置
      </p>
      {!!merge.conflicts.length && (
        <div className="merge-conflicts">
          <h4>
            {merge.unresolved
              ? `有 ${merge.unresolved} 项冲突待处理`
              : `已处理 ${merge.conflicts.length} 项冲突`}
          </h4>
          {merge.conflicts.map((conflict) => (
            <div key={conflict.key} className="merge-conflict">
              <strong>
                {conflict.kind === "sql"
                  ? "SQL 同名内容不同"
                  : "同一路径配置不同"}{" "}
                · {conflict.label}
              </strong>
              {onResolve ? (
                <label className="field">
                  <span>选择保留内容</span>
                  <select
                    aria-label={`冲突取舍 ${conflict.label}`}
                    disabled={disabled}
                    value={conflict.selectedId}
                    onChange={(e) => onResolve(conflict.key, e.target.value)}
                  >
                    <option value="">请选择，不能自动覆盖</option>
                    {conflict.choices.map((choice) => (
                      <option value={choice.id} key={choice.id}>
                        {choice.origins.map((o) => o.versionName).join("、")} ·{" "}
                        {choice.item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="muted small">
                  保留：
                  {conflict.choices
                    .find((c) => c.id === conflict.selectedId)
                    ?.origins.map((o) => o.versionName)
                    .join("、")}
                </p>
              )}
              {conflict.choices.map((choice) => (
                <details key={choice.id}>
                  <summary>
                    查看 {choice.origins.map((o) => o.versionName).join("、")}{" "}
                    的内容
                  </summary>
                  <pre>
                    {conflict.kind === "sql"
                      ? choice.item.sql
                      : choice.item.content}
                  </pre>
                </details>
              ))}
            </div>
          ))}
        </div>
      )}
      <Note>
        以下内容仅作为人工操作资料，触发 Jenkins 不会执行 SQL 或同步配置。
      </Note>
      <div className="resource-downloads">
        <Button
          disabled={!!merge.unresolved}
          onClick={() =>
            downloadText(
              "发布资料快照.json",
              JSON.stringify(merge, null, 2),
              "application/json",
            )
          }
        >
          下载资料快照
        </Button>
        <Button
          disabled={!!merge.unresolved || !merge.scripts.length}
          onClick={() =>
            downloadText(
              "合并SQL-人工执行.sql",
              merge.scripts
                .map(
                  (script) =>
                    `-- ${script.order}. ${script.database} / ${script.name}\n-- 来源: ${script.origins.map((o) => o.versionName).join(", ")}\n${script.sql}`,
                )
                .join("\n\n"),
            )
          }
        >
          下载 SQL 清单
        </Button>
      </div>
      {merge.scripts.map((script, index) => (
        <details className="merged-file" key={`${script.id}-${index}`}>
          <summary>
            SQL {script.order} · {script.database} / {script.name}{" "}
            <small>
              来源 {script.origins.map((o) => o.versionName).join("、")}
            </small>
          </summary>
          <pre>{script.sql}</pre>
        </details>
      ))}
      {merge.configs.map((config, index) => (
        <details className="merged-file" key={`${config.id}-${index}`}>
          <summary>
            配置 · {config.resolvedPath || config.path || config.name}{" "}
            <small>
              来源 {config.origins.map((o) => o.versionName).join("、")}
            </small>
          </summary>
          <Button onClick={() => downloadText(config.name, config.content)}>
            下载配置文件
          </Button>
          <pre>{config.content}</pre>
        </details>
      ))}
    </section>
  );
}
