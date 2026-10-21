import { randomUUID } from "node:crypto";
import { AppError } from "./store.mjs";
import { validateCollection } from "./validation.mjs";

const fields = {
  project: ["name", "key", "description", "color"],
  service: ["name", "kind", "repository", "defaultBranch"],
  environment: [
    "name",
    "key",
    "type",
    "servers",
    "bindings",
    "deployPath",
    "backupPath",
    "dbHost",
    "dbPort",
    "database",
    "dbUser",
    "configPath",
  ],
  version: ["name", "title", "status", "author"],
  sql: [
    "name",
    "database",
    "order",
    "kind",
    "description",
    "sql",
    "previousSql",
  ],
  config: ["name", "path", "format", "content", "previousContent"],
};
export const entities = Object.keys(fields);
function locate(store, input) {
  const { entity, projectId, versionId } = input;
  if (!entities.includes(entity)) throw new AppError("未知资料类型");
  const collection =
    entity === "project" || entity === "service"
      ? "projects"
      : entity === "environment"
        ? "environments"
        : "releases";
  const state = store.publicState()[collection];
  if (
    ["service", "environment", "version", "sql", "config"].includes(entity) &&
    !store.get("projects").data.some((p) => p.id === projectId)
  )
    throw new AppError("请指定存在的 projectId");
  let parent, records;
  if (entity === "service") {
    parent = state.data.find((p) => p.id === projectId);
    records = parent.services;
  } else if (entity === "sql" || entity === "config") {
    parent = state.data.find(
      (v) => v.id === versionId && v.projectId === projectId,
    );
    if (!parent) throw new AppError("请指定当前项目的 versionId");
    records = parent[entity === "sql" ? "scripts" : "configs"];
  } else
    records = state.data.filter(
      (r) => entity === "project" || r.projectId === projectId,
    );
  return { collection, state, parent, records };
}
const defaults = (entity, input, records) => {
  const now = new Date().toISOString();
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" })
    .format(new Date())
    .replaceAll("-", "");
  const suffixes = records
    .filter((r) => r.name?.startsWith(day + "-"))
    .map((r) => Number(r.name.slice(day.length + 1)))
    .filter(Number.isFinite);
  const base = {
    project: { description: "", color: "green", updated: now, services: [] },
    service: { kind: "后端服务", defaultBranch: "main" },
    environment: {
      projectId: input.projectId,
      type: "测试",
      servers: [],
      bindings: [],
      deployPath: "",
      backupPath: "",
      dbHost: "",
      dbPort: "3306",
      database: "",
      dbUser: "",
      configPath: "",
      checkedAt: "尚未检查",
    },
    version: {
      name: `${day}-${String(Math.max(0, ...suffixes) + 1).padStart(2, "0")}`,
      projectId: input.projectId,
      title: "版本更新",
      status: "草稿",
      created: now,
      author: "外部 AI",
      scripts: [],
      configs: [],
      components: [],
    },
    sql: {
      database: "",
      order: Math.max(0, ...records.map((r) => r.order || 0)) + 1,
      kind: "新增",
      description: "",
      sql: "",
      previousSql: "",
    },
    config: { path: "", format: "YAML", content: "", previousContent: "" },
  };
  return { id: randomUUID(), ...base[entity] };
};
export function recordOperation(store, operation, input) {
  if (!input || typeof input !== "object") throw new AppError("资料请求无效");
  const { entity, recordId } = input;
  const { collection, state, parent, records } = locate(store, input);
  if (operation === "list")
    return { entity, revision: state.revision, records };
  const record = records.find((r) => r.id === recordId);
  if (operation !== "create" && !record)
    throw new AppError("资料不存在或不属于指定项目/版本", 404);
  if (operation === "get") return { entity, revision: state.revision, record };
  if (!["create", "update", "delete"].includes(operation))
    throw new AppError("未知资料操作");
  if (!Number.isInteger(input.revision) || input.revision !== state.revision)
    throw new AppError("资料修订号已变化，请重新查询后再修改", 409);
  if (operation === "delete" && input.confirmed !== true)
    throw new AppError("删除资料需要 confirmed=true");
  const data = input.data || {};
  const hostFields = [
    "id",
    "name",
    "host",
    "port",
    "username",
    "authentication",
    "credentialConfigured",
  ];
  if (
    entity === "environment" &&
    Array.isArray(data.servers) &&
    data.servers.some(
      (server) =>
        server &&
        typeof server === "object" &&
        Object.keys(server).some((key) => !hostFields.includes(key)),
    )
  )
    throw new AppError(
      "主机资料不接收密码、私钥或未知字段；请在页面维护加密凭据",
    );
  if (
    operation !== "delete" &&
    (typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((key) => !fields[entity].includes(key)))
  )
    throw new AppError(
      `可写字段：${fields[entity].join("、")}；ID 与所属关系不可修改，不接收连接密码`,
    );
  const value =
    operation === "create"
      ? { ...defaults(entity, input, records), ...data }
      : { ...record, ...data };
  const next =
    operation === "create"
      ? [...records, value]
      : operation === "delete"
        ? records.filter((r) => r.id !== recordId)
        : records.map((r) => (r.id === recordId ? value : r));
  let all;
  if (entity === "service")
    all = state.data.map((p) =>
      p.id === parent.id
        ? { ...p, services: next, updated: new Date().toISOString() }
        : p,
    );
  else if (entity === "sql" || entity === "config")
    all = state.data.map((v) =>
      v.id === parent.id
        ? { ...v, [entity === "sql" ? "scripts" : "configs"]: next }
        : v,
    );
  else
    all = [
      ...state.data.filter((r) => !records.some((item) => item.id === r.id)),
      ...next,
    ];
  const saved = store.save(
    collection,
    validateCollection(store, collection, all),
    input.revision,
  );
  if (operation === "delete" && entity === "environment") {
    for (const row of store.db.prepare("SELECT id FROM secrets").all())
      if (
        row.id === `db:${recordId}` ||
        row.id.startsWith(`ssh:${recordId}:`) ||
        row.id.startsWith(`hostkey:${recordId}:`)
      )
        store.db.prepare("DELETE FROM secrets WHERE id=?").run(row.id);
  }
  return {
    entity,
    revision: saved.revision,
    ...(operation === "delete"
      ? { deleted: recordId }
      : {
          record: locate(store, input).records.find(
            (record) => record.id === value.id,
          ),
        }),
  };
}
