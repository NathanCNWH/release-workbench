import http from "node:http";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  createReadStream,
  statSync,
} from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Store, AppError, collections } from "./store.mjs";
import { validateCollection } from "./validation.mjs";
import { Jenkins } from "./jenkins.mjs";
import { Deployments } from "./deployments.mjs";
import { Backups } from "./backups.mjs";
import { checkMysql, checkSsh } from "./connections.mjs";
import { acquireLock } from "./lock.mjs";
import { mergeVersions } from "./versions.mjs";
import { recordOperation } from "./records.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sameToken = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export async function createApp({
  directory = process.env.RW_DATA_DIR || resolve(ROOT, "data"),
  port = Number(process.env.RW_PORT || 4173),
  monitorOptions = {},
  serveFiles = true,
} = {}) {
  const instanceId = randomUUID(),
    releaseLock = acquireLock(resolve(directory), instanceId);
  let store;
  try {
    store = new Store(directory);
  } catch (error) {
    releaseLock();
    throw error;
  }
  const engine = new Deployments(store, monitorOptions),
    backups = new Backups(store);
  const tokenPath = resolve(directory, ".api-token");
  if (!existsSync(tokenPath))
    writeFileSync(tokenPath, randomBytes(32).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  const token = readFileSync(tokenPath, "utf8").trim();
  let closing = false;
  const json = (res, code, data) => {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const body = async (req) => {
    let bytes = 0,
      data = "";
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024)
        throw new AppError("请求超过 16 MB，请减少本次资料大小", 413);
      data += chunk;
    }
    if (!data) return {};
    try {
      return JSON.parse(data);
    } catch {
      throw new AppError("请求 JSON 格式错误");
    }
  };
  function profile(id) {
    const p = store.get("jenkinsProfiles").data.find((p) => p.id === id);
    if (!p || !p.url || !p.username || !store.hasSecret(`jenkins:${id}`))
      throw new AppError("请先保存 Jenkins 地址、账号和 Token");
    return new Jenkins(p, store.secret(`jenkins:${id}`));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
        throw new AppError("仅允许本机访问", 403);
      const url = new URL(req.url, `http://${host}`),
        path = url.pathname;
      const bearer = sameToken(
        req.headers.authorization?.replace(/^Bearer /, ""),
        token,
      );
      const origin = req.headers.origin;
      const localOrigin =
        origin === `http://${host}` ||
        origin === "http://127.0.0.1:5173" ||
        origin === "http://localhost:5173";
      if (origin && !localOrigin)
        throw new AppError("拒绝来自其他站点的请求", 403);
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !bearer &&
        !(localOrigin && req.headers["x-workbench-client"] === "local")
      )
        throw new AppError("请求来源校验失败", 403);
      if (req.method === "GET" && path === "/api/health")
        return json(res, 200, {
          app: "release-workbench",
          version: "0.6.2",
          status: closing ? "stopping" : "ready",
          instanceId,
          pid: process.pid,
        });
      if (req.method === "GET" && path === "/api/state")
        return json(res, 200, store.publicState());
      const records = path.match(
        /^\/api\/records\/(list|get|create|update|delete)$/,
      );
      if (req.method === "POST" && records)
        return json(
          res,
          200,
          recordOperation(store, records[1], await body(req)),
        );
      if (req.method === "POST" && path === "/api/versions/merge")
        return json(res, 200, mergeVersions(store, await body(req)));
      if (req.method === "GET" && path === "/api/info")
        return json(res, 200, {
          dataDirectory: store.directory,
          mcp: {
            command: process.execPath,
            args: [resolve(ROOT, "server/mcp.mjs")],
            env: {
              RW_BASE_URL: `http://127.0.0.1:${server.address().port}`,
              RW_DATA_DIR: store.directory,
            },
          },
          aiScope:
            "查询资料、预览和触发已绑定 Jenkins Job；不执行 SQL 或更新配置",
        });
      if (req.method === "GET" && path === "/api/skill/download") {
        res.writeHead(200, {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="SKILL.md"',
        });
        return res.end(
          readFileSync(
            resolve(ROOT, "integrations/release-workbench/SKILL.md"),
          ),
        );
      }
      if (req.method === "PUT" && path.startsWith("/api/state/")) {
        const name = path.slice("/api/state/".length),
          input = await body(req);
        if (!Number.isInteger(input.revision))
          throw new AppError("缺少资料修订号", 409);
        if (!collections.includes(name))
          throw new AppError("未知资料类型", 404);
        const data = validateCollection(store, name, input.data);
        store.save(name, data, input.revision);
        return json(res, 200, store.publicState()[name]);
      }
      if (req.method === "PUT" && path === "/api/credentials") {
        const input = await body(req);
        if (input.kind === "jenkins") {
          if (
            !["frontend", "backend"].includes(input.id) ||
            typeof input.token !== "string" ||
            input.token.length > 32000
          )
            throw new AppError("Jenkins 凭据请求无效");
          store.setSecret(`jenkins:${input.id}`, input.token);
        } else if (input.kind === "environment") {
          const e = store
            .get("environments")
            .data.find((e) => e.id === input.id);
          if (!e) throw new AppError("环境不存在", 404);
          const values = input.values;
          if (!values || typeof values !== "object")
            throw new AppError("凭据请求无效");
          for (const [key, value] of Object.entries(values)) {
            if (typeof value !== "string" || value.length > 100000)
              throw new AppError("凭据格式无效");
            if (key === "database") store.setSecret(`db:${e.id}`, value);
            else if (e.servers.some((s) => s.id === key))
              store.setSecret(`ssh:${e.id}:${key}`, value);
            else throw new AppError("凭据对应的服务器不存在");
          }
        } else throw new AppError("未知凭据类型");
        return json(res, 200, { ok: true });
      }
      const jenkinsCheck = path.match(
        /^\/api\/jenkins\/(frontend|backend)\/check$/,
      );
      if (req.method === "POST" && jenkinsCheck)
        return json(res, 200, await profile(jenkinsCheck[1]).check());
      const job = path.match(/^\/api\/jenkins\/(frontend|backend)\/job$/);
      if (req.method === "GET" && job) {
        const jobPath = url.searchParams.get("path");
        if (
          !jobPath ||
          jobPath.split("/").some((p) => !p || p === "." || p === "..") ||
          /[?#\\]/.test(jobPath)
        )
          throw new AppError("Job 路径无效");
        return json(res, 200, await profile(job[1]).metadata(jobPath));
      }
      const connection = path.match(/^\/api\/environments\/([^/]+)\/check$/);
      if (req.method === "POST" && connection) {
        const input = await body(req),
          e = store
            .get("environments")
            .data.find((e) => e.id === decodeURIComponent(connection[1]));
        if (!e) throw new AppError("环境不存在", 404);
        return json(
          res,
          200,
          input.kind === "mysql"
            ? await checkMysql(store, e)
            : input.kind === "ssh"
              ? await checkSsh(store, e, input.serverId)
              : (() => {
                  throw new AppError("未知连接类型");
                })(),
        );
      }
      if (req.method === "POST" && path === "/api/deployments/preview")
        return json(res, 200, engine.preview(await body(req)));
      if (req.method === "POST" && path === "/api/deployments/run") {
        const input = await body(req);
        if (input.confirmed !== true || typeof input.planId !== "string")
          throw new AppError("请确认发布预览");
        return json(
          res,
          202,
          engine.run(input.planId, bearer ? "外部 AI / CLI" : "本地用户"),
        );
      }
      const deployment = path.match(
        /^\/api\/deployments\/([^/]+)(\/refresh|\/logs)?$/,
      );
      if (deployment) {
        const id = decodeURIComponent(deployment[1]);
        if (req.method === "GET" && !deployment[2])
          return json(res, 200, store.deployment(id));
        if (req.method === "GET" && deployment[2] === "/logs")
          return json(
            res,
            200,
            await engine.logs(id, url.searchParams.get("serviceId")),
          );
        if (req.method === "POST" && deployment[2] === "/refresh")
          return json(res, 200, await engine.refresh(id));
      }
      if (req.method === "POST" && path === "/api/backups/workspace")
        return json(res, 201, await backups.workspace());
      if (req.method === "POST" && path === "/api/backups/mysql")
        return json(res, 202, backups.mysql((await body(req)).environmentId));
      const download = path.match(/^\/api\/backups\/([^/]+)\/download$/);
      if (req.method === "GET" && download) {
        const record = backups.file(decodeURIComponent(download[1]));
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(record.name)}"`,
          "Cache-Control": "no-store",
        });
        return createReadStream(record.file).pipe(res);
      }
      if (req.method === "GET" && path === "/api/context") {
        const state = store.publicState(),
          project = state.projects.data.find(
            (p) => p.id === url.searchParams.get("projectId"),
          );
        if (!project) throw new AppError("项目不存在", 404);
        return json(res, 200, {
          project,
          releases: state.releases.data.filter(
            (r) => r.projectId === project.id,
          ),
          environments: state.environments.data.filter(
            (e) => e.projectId === project.id,
          ),
          deployments: state.deployments.filter(
            (d) => d.projectId === project.id,
          ),
          allowedActions: [
            "资料查询、新增、编辑、删除或归档",
            "多版本合并发布资料",
            "预览并触发已绑定 Jenkins Job",
          ],
          manualActions: ["SQL 人工执行", "配置人工更新"],
        });
      }
      if (req.method === "POST" && path === "/api/shutdown") {
        if (!bearer) throw new AppError("停止应用需使用本机管理脚本", 403);
        json(res, 200, { ok: true });
        setImmediate(() => void stop());
        return;
      }
      if (path.startsWith("/api/")) throw new AppError("接口不存在", 404);
      if (!serveFiles || !["GET", "HEAD"].includes(req.method))
        throw new AppError("页面不存在", 404);
      const dist = resolve(ROOT, "dist");
      let file = resolve(dist, `.${decodeURIComponent(path)}`);
      if (!file.startsWith(`${dist}${sep}`) && file !== dist)
        throw new AppError("文件路径无效", 403);
      if (!existsSync(file) || statSync(file).isDirectory()) {
        if (extname(path) && path !== "/index.html")
          throw new AppError("资源不存在", 404);
        file = resolve(dist, "index.html");
      }
      if (!existsSync(file))
        throw new AppError("前端尚未构建，请运行 npm run build", 503);
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      );
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control":
          extname(file) === ".html" ? "no-store" : "public, max-age=3600",
      });
      if (req.method === "HEAD") return res.end();
      createReadStream(file).pipe(res);
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500) console.error(store.redact(error.stack));
      if (!res.headersSent)
        json(res, status, {
          error:
            status === 500
              ? "服务器内部错误，请查看本机日志"
              : store.redact(error.message),
        });
      else res.end();
    }
  });
  async function stop() {
    if (closing) return;
    closing = true;
    engine.stop();
    await new Promise((resolveClose) => server.close(resolveClose));
    await backups.stop();
    const until = Date.now() + 16000;
    while (engine.active.size && Date.now() < until)
      await new Promise((r) => setTimeout(r, 50));
    store.close();
    releaseLock();
  }
  try {
    await new Promise((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolveListen);
    });
  } catch (error) {
    store.close();
    releaseLock();
    throw error;
  }
  engine.start();
  return {
    server,
    store,
    engine,
    stop,
    instanceId,
    port: server.address().port,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp();
  console.log(`Release Workbench ready: http://127.0.0.1:${app.port}/`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => void app.stop());
}
