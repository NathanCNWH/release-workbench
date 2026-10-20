import { z } from "zod";
import { AppError } from "./store.mjs";
const text = z.string().max(2000),
  required = z.string().trim().min(1).max(160),
  id = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/);
const port = z
  .string()
  .refine(
    (v) => /^\d+$/.test(v) && +v > 0 && +v <= 65535,
    "端口必须在 1–65535 之间",
  );
const service = z.object({
  id,
  name: required,
  kind: z.enum(["后端服务", "前端应用"]),
  repository: z.string().trim().min(1).max(2000),
  defaultBranch: required,
});
const script = z.object({
  id,
  name: required,
  database: text,
  order: z.number().int().positive(),
  kind: z.enum(["新增", "修改", "沿用"]),
  description: text,
  sql: z.string().max(1000000),
  previousSql: z.string().max(1000000),
});
const config = z.object({
  id,
  name: required,
  path: text,
  format: required,
  content: z.string().max(1000000),
  previousContent: z.string().max(1000000),
});
const binding = z.object({
  serviceId: id,
  job: z.string().trim().max(2000),
  parameters: z.string().max(10000),
  supportsBranch: z.boolean(),
  branchParameter: text,
  branches: z.array(required).max(2000),
  defaultBranch: text,
});
const schemas = {
  projects: z
    .array(
      z.object({
        id,
        name: required,
        key: required.regex(/^[a-zA-Z0-9_-]+$/),
        description: text,
        color: text,
        updated: text,
        services: z.array(service).max(300),
      }),
    )
    .max(300),
  releases: z
    .array(
      z.object({
        id,
        projectId: id,
        name: required,
        title: required,
        status: z.enum(["草稿", "就绪", "已归档"]),
        created: text,
        author: text,
        scripts: z.array(script).max(500),
        configs: z.array(config).max(500),
        components: z.array(z.any()).max(300).default([]),
      }),
    )
    .max(5000),
  environments: z
    .array(
      z.object({
        id,
        projectId: id,
        name: required,
        key: required.regex(/^[a-zA-Z0-9_-]+$/),
        type: required,
        servers: z
          .array(
            z.object({
              id,
              name: required,
              host: required,
              port,
              username: required,
              authentication: z.enum(["password", "environment", "key"]),
            }),
          )
          .min(1)
          .max(100),
        bindings: z.array(binding).max(300),
        deployPath: text,
        backupPath: text,
        dbHost: text,
        dbPort: port,
        database: text,
        dbUser: text,
        configPath: text,
        checkedAt: text,
      }),
    )
    .max(500),
  jenkinsProfiles: z
    .array(
      z.object({
        id: z.enum(["frontend", "backend"]),
        name: required,
        url: z.string().trim().max(2000),
        username: z.string().trim().max(200),
        credentialConfigured: z.boolean().optional(),
      }),
    )
    .length(2),
};
export function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new AppError(
      r.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("；")
        .slice(0, 800),
    );
  return r.data;
}
export function unique(items, key, message = "标识不能重复") {
  if (new Set(items.map(key)).size !== items.length)
    throw new AppError(message);
}
export function parameters(binding, branch) {
  const params = Object.create(null);
  for (const line of binding.parameters
    .split(/\r?\n/)
    .filter((v) => v.trim())) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$/);
    if (!match) throw new AppError("固定参数须每行填写 NAME=value");
    if (Object.hasOwn(params, match[1]))
      throw new AppError(`参数 ${match[1]} 重复`);
    params[match[1]] = match[2];
  }
  if (binding.supportsBranch) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(binding.branchParameter))
      throw new AppError("分支参数名无效");
    if (!binding.branches.includes(branch))
      throw new AppError("所选分支不在当前任务的可选范围内");
    if (Object.hasOwn(params, binding.branchParameter))
      throw new AppError("分支参数与固定参数重复，请保留一处");
    params[binding.branchParameter] = branch;
  } else if (branch) throw new AppError("此任务不支持选择分支");
  return params;
}
export function validJenkinsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("Jenkins 地址无效");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new AppError(
      "Jenkins 地址须为不含账号、参数或片段的 HTTP/HTTPS 地址",
    );
  return url.href.replace(/\/$/, "");
}
export function validateCollection(store, name, input) {
  if (!schemas[name]) throw new AppError("未知资料类型", 404);
  const data = parse(schemas[name], input);
  unique(data, (i) => i.id);
  const projects = name === "projects" ? data : store.get("projects").data;
  if (name === "projects") {
    unique(data, (p) => p.key, "项目标识不能重复");
    for (const p of data) {
      unique(p.services, (s) => s.id);
      unique(p.services, (s) => s.name, "同一项目服务名称不能重复");
      for (const s of p.services)
        if (/^https?:\/\//i.test(s.repository)) {
          let url;
          try {
            url = new URL(s.repository);
          } catch {
            throw new AppError("Git HTTP 地址无效");
          }
          if (url.password || url.username)
            throw new AppError(
              "Git 地址不能包含密码或 Token，请使用 Git 客户端凭据管理",
            );
        }
    }
    const refs = [
      ...store.get("environments").data,
      ...store.get("releases").data,
    ];
    if (refs.some((r) => !data.some((p) => p.id === r.projectId)))
      throw new AppError("有历史资料引用的项目不能删除");
    for (const e of store.get("environments").data)
      if (
        e.bindings.some(
          (b) =>
            !projects
              .find((p) => p.id === e.projectId)
              .services.some((s) => s.id === b.serviceId),
        )
      )
        throw new AppError("已绑定任务的服务不能删除");
  }
  if (["releases", "environments"].includes(name)) {
    if (data.some((item) => !projects.some((p) => p.id === item.projectId)))
      throw new AppError("所属项目不存在");
    unique(
      data,
      (i) => `${i.projectId}:${name === "releases" ? i.name : i.key}`,
      "同一项目内名称或标识重复",
    );
    const before = store.get(name).data;
    if (before.some((old) => !data.some((i) => i.id === old.id)))
      throw new AppError("当前不支持永久删除版本或环境，请保留历史资料");
    if (
      data.some((item) =>
        before.some(
          (old) => old.id === item.id && old.projectId !== item.projectId,
        ),
      )
    )
      throw new AppError("资料不能移动到其他项目");
  }
  if (name === "releases")
    for (const item of data) {
      const old = store.get(name).data.find((o) => o.id === item.id);
      item.components = []; // Actual service scope belongs exclusively to deployment snapshots.
      unique(item.scripts, (s) => s.id);
      unique(item.configs, (c) => c.id);
      if (
        old &&
        old.status !== "草稿" &&
        JSON.stringify({ ...old, status: "" }) !==
          JSON.stringify({ ...item, status: "" })
      )
        throw new AppError("就绪或归档版本不能修改资源，请复制为新版本");
      if (old && old.status !== "草稿" && item.status === "草稿")
        throw new AppError("固定版本不能退回草稿");
    }
  if (name === "environments")
    for (const e of data) {
      unique(e.servers, (s) => s.id);
      unique(e.bindings, (b) => b.serviceId);
      for (const b of e.bindings) {
        if (
          !projects
            .find((p) => p.id === e.projectId)
            .services.some((s) => s.id === b.serviceId)
        )
          throw new AppError("任务绑定包含其他项目或不存在的服务");
        if (b.job) {
          if (
            b.job.split("/").some((v) => !v || v === "." || v === "..") ||
            /[?#\\]/.test(b.job)
          )
            throw new AppError("Job 路径无效，请填写 folder/job，不填写 URL");
          parameters(b, b.supportsBranch ? b.defaultBranch : "");
        }
      }
    }
  if (name === "jenkinsProfiles") {
    if (
      !data.some((p) => p.id === "frontend") ||
      !data.some((p) => p.id === "backend")
    )
      throw new AppError("必须保留前端和后端 Jenkins 配置");
    for (const p of data) {
      if (p.url) p.url = validJenkinsUrl(p.url);
      delete p.credentialConfigured;
    }
  }
  return data;
}
