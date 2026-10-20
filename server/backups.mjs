import { randomUUID, createHash } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { AppError } from "./store.mjs";

export class Backups {
  constructor(store, { spawnProcess = spawn } = {}) {
    this.store = store;
    this.directory = resolve(store.directory, "backups");
    this.running = new Set();
    this.spawn = spawnProcess;
    this.children = new Set();
    this.jobs = new Set();
    for (const record of store
      .list("backups")
      .filter((b) => b.status === "备份中"))
      store.record("backups", record.id, {
        ...record,
        status: "备份失败",
        error: "应用在备份期间退出，临时文件不能视为可恢复备份。",
      });
  }
  async workspace() {
    await mkdir(this.directory, { recursive: true });
    const id = `BKP-${randomUUID()}`,
      name = `workbench-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const file = resolve(this.directory, name),
      state = this.store.publicState();
    await writeFile(
      file,
      JSON.stringify(
        {
          format: "release-workbench-v1",
          created: new Date().toISOString(),
          note: "连接凭据未导出；SQL/配置文本保持原样，请按敏感资料保管。",
          collections: Object.fromEntries(
            ["projects", "releases", "environments", "jenkinsProfiles"].map(
              (k) => [k, state[k].data],
            ),
          ),
          deployments: state.deployments,
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    return this.finish(
      {
        id,
        projectId: "",
        environmentId: "",
        name,
        type: "工作台资料",
        version: "",
        created: new Date().toISOString(),
      },
      file,
    );
  }
  mysql(environmentId) {
    const e = this.store
      .get("environments")
      .data.find((e) => e.id === environmentId);
    if (
      !e ||
      !e.dbHost ||
      !e.dbUser ||
      !e.database ||
      e.database.startsWith("-") ||
      /[\0\r\n]/.test(e.database)
    )
      throw new AppError("请先维护有效的数据库地址、账号和库名");
    const target = `${e.dbHost}:${e.dbPort}/${e.database}`;
    if (this.running.has(target)) throw new AppError("该数据库正在备份", 409);
    this.running.add(target);
    const id = `BKP-${randomUUID()}`,
      name = `${id}.sql.gz`;
    const record = {
      id,
      projectId: e.projectId,
      environmentId,
      name,
      type: "MySQL",
      version: "",
      size: "待生成",
      created: new Date().toISOString(),
      location: this.directory,
      status: "备份中",
    };
    this.store.record("backups", id, record);
    const task = this.dump(e, record).finally(() => {
      this.running.delete(target);
      this.jobs.delete(task);
    });
    this.jobs.add(task);
    return record;
  }
  async dump(e, record) {
    const file = resolve(this.directory, record.name),
      temporary = `${file}.tmp`;
    let child,
      stderr = "";
    try {
      await mkdir(this.directory, { recursive: true });
      child = this.spawn(
        process.env.RW_MYSQLDUMP || "mysqldump",
        [
          `--host=${e.dbHost}`,
          `--port=${e.dbPort}`,
          `--user=${e.dbUser}`,
          "--single-transaction",
          "--quick",
          "--hex-blob",
          "--routines",
          "--triggers",
          "--events",
          "--databases",
          e.database,
        ],
        {
          shell: false,
          windowsHide: true,
          env: { ...process.env, MYSQL_PWD: this.store.secret(`db:${e.id}`) },
          timeout: 30 * 60 * 1000,
        },
      );
      child.stderr.on("data", (data) => {
        if (stderr.length < 8000) stderr += data;
      });
      this.children.add(child);
      const exited = new Promise((resolveExit, reject) => {
        child.once("error", (error) => reject(error));
        child.once("close", (code) =>
          code === 0
            ? resolveExit()
            : reject(
                new Error(
                  this.store.redact(stderr) || `mysqldump 退出码 ${code}`,
                ),
              ),
        );
      });
      await Promise.all([
        exited,
        pipeline(
          child.stdout,
          createGzip(),
          createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
        ),
      ]);
      await rename(temporary, file);
      await this.finish(record, file);
    } catch (error) {
      child?.kill();
      await rm(temporary, { force: true }).catch(() => {});
      this.store.record("backups", record.id, {
        ...record,
        status: "备份失败",
        error:
          error.code === "ENOENT"
            ? "未找到 mysqldump。请安装 MySQL 客户端，并将其加入 PATH，或设置 RW_MYSQLDUMP 为可执行文件完整路径。"
            : this.store.redact(error.message).slice(0, 2000),
      });
    } finally {
      if (child) this.children.delete(child);
    }
  }
  async finish(record, file) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const info = await stat(file);
    const complete = {
      ...record,
      location: this.directory,
      status: "备份完成",
      bytes: info.size,
      size: `${(info.size / 1024).toFixed(1)} KB`,
      sha256: hash.digest("hex"),
      file,
    };
    this.store.record("backups", record.id, complete);
    return complete;
  }
  async stop() {
    for (const child of this.children) child.kill();
    await Promise.allSettled([...this.jobs]);
  }
  file(id) {
    const record = this.store.list("backups").find((b) => b.id === id);
    if (
      !record ||
      record.status !== "备份完成" ||
      !record.file ||
      (!resolve(record.file).startsWith(`${this.directory}\\`) &&
        !resolve(record.file).startsWith(`${this.directory}/`))
    )
      throw new AppError("可下载备份不存在", 404);
    return record;
  }
}
