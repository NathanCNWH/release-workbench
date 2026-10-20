import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export const blankProfiles = [
  {
    id: "frontend",
    name: "前端 Jenkins",
    url: "",
    username: "",
    credentialConfigured: false,
  },
  {
    id: "backend",
    name: "后端 Jenkins",
    url: "",
    username: "",
    credentialConfigured: false,
  },
];
export const collections = [
  "projects",
  "releases",
  "environments",
  "jenkinsProfiles",
];
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export class Store {
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const keyPath = resolve(this.directory, ".master-key");
    // Never silently replace a missing key for an existing database.
    if (!existsSync(keyPath)) {
      if (existsSync(resolve(this.directory, "workbench.sqlite")))
        throw new Error(
          "本机加密密钥缺失。请恢复原数据目录的 .master-key，不能生成新密钥覆盖。",
        );
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error("本机加密密钥长度无效");
    this.db = new DatabaseSync(resolve(this.directory, "workbench.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS collections(name TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deployments(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY, data TEXT NOT NULL, used TEXT);
      CREATE TABLE IF NOT EXISTS backups(id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
    for (const name of collections)
      this.db
        .prepare("INSERT OR IGNORE INTO collections VALUES(?,?,0)")
        .run(
          name,
          JSON.stringify(name === "jenkinsProfiles" ? blankProfiles : []),
        );
  }
  close() {
    this.db.close();
  }
  get(name) {
    const row = this.db
      .prepare("SELECT * FROM collections WHERE name=?")
      .get(name);
    if (!row) throw new AppError("未知资料类型", 404);
    return { data: JSON.parse(row.data), revision: row.revision };
  }
  all() {
    return Object.fromEntries(
      collections.map((name) => [name, this.get(name)]),
    );
  }
  save(name, data, revision) {
    const result = this.db
      .prepare(
        "UPDATE collections SET data=?,revision=revision+1 WHERE name=? AND revision=?",
      )
      .run(JSON.stringify(data), name, revision);
    if (!result.changes)
      throw new AppError(
        "资料已在其他窗口更新，请刷新后重试。当前修改未覆盖服务器资料。",
        409,
      );
    return this.get(name);
  }
  setSecret(id, value) {
    if (!value) return;
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const blob = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
    this.db.prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)").run(id, blob);
  }
  secret(id) {
    const row = this.db.prepare("SELECT value FROM secrets WHERE id=?").get(id);
    if (!row) return "";
    const blob = Buffer.from(row.value, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        blob.subarray(0, 12),
      );
    decipher.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([
      decipher.update(blob.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
  hasSecret(id) {
    return !!this.db.prepare("SELECT 1 FROM secrets WHERE id=?").get(id);
  }
  redact(value) {
    let text = String(value ?? "");
    for (const row of this.db.prepare("SELECT id FROM secrets").all()) {
      const secret = this.secret(row.id);
      if (secret) {
        text = text
          .replaceAll(secret, "[REDACTED]")
          .replaceAll(encodeURIComponent(secret), "[REDACTED]");
      }
    }
    for (const profile of this.get("jenkinsProfiles").data) {
      const secret = this.secret(`jenkins:${profile.id}`);
      if (secret && profile.username)
        text = text.replaceAll(
          Buffer.from(`${profile.username}:${secret}`).toString("base64"),
          "[REDACTED]",
        );
    }
    return text;
  }
  list(table) {
    if (!["deployments", "backups"].includes(table))
      throw new Error("invalid table");
    return this.db
      .prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`)
      .all()
      .map((row) => JSON.parse(row.data));
  }
  record(table, id, data) {
    if (!["deployments", "backups"].includes(table))
      throw new Error("invalid table");
    this.db
      .prepare(
        `INSERT INTO ${table} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(id, JSON.stringify(data));
    return data;
  }
  deployment(id) {
    const row = this.db
      .prepare("SELECT data FROM deployments WHERE id=?")
      .get(id);
    if (!row) throw new AppError("发布记录不存在", 404);
    return JSON.parse(row.data);
  }
  createPlan(plan) {
    this.db
      .prepare("INSERT INTO plans VALUES(?,?,NULL)")
      .run(plan.id, JSON.stringify(plan));
    return plan;
  }
  claimPlan(id, createRecord) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT * FROM plans WHERE id=?").get(id);
      if (!row) throw new AppError("发布预览不存在或已过期", 404);
      if (row.used) {
        const record = this.deployment(row.used);
        this.db.exec("COMMIT");
        return { record, created: false };
      }
      const plan = JSON.parse(row.data);
      if (Date.now() > plan.expiresAt)
        throw new AppError("发布预览已过期，请重新预览");
      const record = createRecord(plan);
      this.record("deployments", record.id, record);
      this.db.prepare("UPDATE plans SET used=? WHERE id=?").run(record.id, id);
      this.db.exec("COMMIT");
      return { record, created: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  publicState() {
    const state = this.all();
    state.jenkinsProfiles.data = state.jenkinsProfiles.data.map((p) => ({
      ...p,
      credentialConfigured: this.hasSecret(`jenkins:${p.id}`),
    }));
    state.environments.data = state.environments.data.map((e) => ({
      ...e,
      dbCredentialConfigured: this.hasSecret(`db:${e.id}`),
      servers: e.servers.map((s) => ({
        ...s,
        credentialConfigured: this.hasSecret(`ssh:${e.id}:${s.id}`),
      })),
    }));
    return {
      ...state,
      deployments: this.list("deployments"),
      backups: this.list("backups"),
    };
  }
}
