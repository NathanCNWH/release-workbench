import { AppError } from "./store.mjs";
export async function checkMysql(store, environment) {
  if (!environment.dbHost || !environment.database || !environment.dbUser)
    throw new AppError("请先填写数据库地址、库名和账号");
  const { createConnection } = await import("mysql2/promise");
  let connection;
  try {
    connection = await createConnection({
      host: environment.dbHost,
      port: +environment.dbPort,
      user: environment.dbUser,
      password: store.secret(`db:${environment.id}`),
      database: environment.database,
      connectTimeout: 10000,
      multipleStatements: false,
    });
    const [rows] = await connection.query({
      sql: "SELECT VERSION() AS version",
      timeout: 10000,
    });
    return {
      ok: true,
      version: rows[0].version,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new AppError(
      store.redact(`MySQL 连接失败：${error.code || error.message}`),
      502,
    );
  } finally {
    if (connection) connection.destroy();
  }
}
export async function checkSsh(store, environment, serverId) {
  const server = environment.servers.find((s) => s.id === serverId);
  if (!server) throw new AppError("服务器不存在", 404);
  const { Client } = await import("ssh2");
  const secretId = `ssh:${environment.id}:${server.id}`;
  const password =
    server.authentication === "environment"
      ? process.env.SSH_PWD
      : store.secret(secretId);
  const username =
    server.authentication === "environment"
      ? process.env.SSH_NAME
      : server.username;
  if (!username || !password)
    throw new AppError(
      server.authentication === "environment"
        ? "启动进程未配置 SSH_NAME / SSH_PWD 环境变量"
        : "请先保存服务器密码或私钥",
    );
  return new Promise((resolve, reject) => {
    const connection = new Client();
    let fingerprint = "",
      changed = false;
    const pinId = `hostkey:${environment.id}:${server.id}:${server.host}:${server.port}`;
    const pin = store.secret(pinId);
    connection.once("ready", () => {
      if (!pin) store.setSecret(pinId, fingerprint);
      connection.end();
      resolve({ ok: true, fingerprint, checkedAt: new Date().toISOString() });
    });
    connection.once("error", (error) => {
      connection.end();
      reject(
        new AppError(
          changed
            ? "SSH 主机指纹已改变，已拒绝连接；请核对服务器。"
            : store.redact(`SSH 连接失败：${error.message}`),
          502,
        ),
      );
    });
    connection.connect({
      host: server.host,
      port: +server.port,
      username,
      ...(server.authentication === "key"
        ? { privateKey: password }
        : { password }),
      readyTimeout: 12000,
      hostHash: "sha256",
      hostVerifier: (hash) => {
        fingerprint = hash;
        changed = !!pin && pin !== hash;
        return !changed;
      },
    });
  });
}
