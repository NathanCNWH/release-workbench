import { createHash } from "node:crypto";
import { posix } from "node:path";
import { AppError } from "./store.mjs";

const normalize = (text) => text.replace(/\r\n/g, "\n").trim();
const hash = (text) => createHash("sha256").update(text).digest("hex");
export function mergeVersions(store, input) {
  if (
    !input ||
    !store.get("projects").data.some((p) => p.id === input.projectId)
  )
    throw new AppError("项目不存在");
  const ids = input.versionIds ?? (input.versionId ? [input.versionId] : []);
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw new AppError("请选择不重复的版本，最多 100 个");
  if (
    input.versionId &&
    input.versionIds &&
    (ids.length !== 1 || ids[0] !== input.versionId)
  )
    throw new AppError("单版本与多版本关联参数不一致");
  const versions = ids.map((id) => {
    const version = store
      .get("releases")
      .data.find((r) => r.id === id && r.projectId === input.projectId);
    if (!version) throw new AppError("关联版本不属于当前项目或已删除");
    return version;
  });
  const resolutions = input.resolutions ?? {};
  if (
    !resolutions ||
    typeof resolutions !== "object" ||
    Array.isArray(resolutions) ||
    Object.entries(resolutions).some(
      ([k, v]) => k.length > 100 || typeof v !== "string",
    )
  )
    throw new AppError("合并冲突选择格式无效");
  const environment = input.environmentId
    ? store
        .get("environments")
        .data.find(
          (e) =>
            e.id === input.environmentId && e.projectId === input.projectId,
        )
    : undefined;
  if (input.environmentId && !environment)
    throw new AppError("目标环境不属于当前项目");
  const conflicts = [],
    scripts = [],
    configs = [],
    validKeys = new Set();
  for (const kind of ["sql", "config"]) {
    const groups = new Map();
    for (const version of versions) {
      const items =
        kind === "sql"
          ? [...version.scripts].sort((a, b) => a.order - b.order)
          : version.configs;
      for (const item of items) {
        const resolvedPath =
          kind === "config"
            ? posix.normalize(
                (item.path || item.name)
                  .replaceAll(
                    "${CONFIG_PATH}",
                    environment?.configPath || "${CONFIG_PATH}",
                  )
                  .replaceAll(
                    "${DEPLOY_PATH}",
                    environment?.deployPath || "${DEPLOY_PATH}",
                  ),
              )
            : "";
        const label =
          kind === "sql" ? `${item.database} / ${item.name}` : resolvedPath;
        const identity =
          kind === "sql"
            ? JSON.stringify([item.database, item.name])
            : resolvedPath;
        const key = `${kind}-${hash(identity)}`;
        const group = groups.get(key) || { key, kind, label, choices: [] };
        const content = kind === "sql" ? normalize(item.sql) : item.content;
        const origin = {
          versionId: version.id,
          versionName: version.name,
          resourceId: item.id,
        };
        const identical = group.choices.find(
          (choice) => choice.normalized === content,
        );
        if (identical) identical.origins.push(origin);
        else
          group.choices.push({
            id: `${version.id}:${item.id}`,
            item: { ...item, ...(kind === "config" ? { resolvedPath } : {}) },
            normalized: content,
            origins: [origin],
          });
        groups.set(key, group);
      }
    }
    const sqlContents = new Map();
    for (const group of groups.values()) {
      let chosen = group.choices[0];
      if (group.choices.length > 1) {
        validKeys.add(group.key);
        const selectedId = resolutions[group.key] || "";
        chosen = group.choices.find((choice) => choice.id === selectedId);
        if (selectedId && !chosen)
          throw new AppError("冲突选项已变化，请重新选择");
        conflicts.push({
          ...group,
          selectedId,
          choices: group.choices.map(({ normalized, ...choice }) => choice),
        });
      }
      if (!chosen) continue;
      const value = { ...chosen.item, origins: chosen.origins };
      if (kind === "sql") {
        const identity = JSON.stringify([
          value.database,
          chosen.normalized || `${group.key}:${chosen.id}`,
        ]);
        const prior = sqlContents.get(identity);
        if (prior) prior.origins.push(...value.origins);
        else {
          sqlContents.set(identity, value);
          scripts.push(value);
        }
      } else configs.push(value);
    }
  }
  if (Object.keys(resolutions).some((key) => !validKeys.has(key)))
    throw new AppError("版本或配置已变化，原冲突选择已失效，请重新合并");
  return {
    versions,
    scripts: scripts.map((script, index) => ({ ...script, order: index + 1 })),
    configs,
    conflicts,
    resolutions,
    unresolved: conflicts.filter((conflict) => !conflict.selectedId).length,
  };
}
