import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { AppError } from "./store.mjs";

export function gitLabRepository(address) {
  try {
    const scp = address.match(/^([^@\s/:]+@[^/\s:]+):([^/\s].*)$/);
    const url = new URL(scp ? "ssh://" + scp[1] + "/" + scp[2] : address);
    const http = ["http:", "https:"].includes(url.protocol);
    if ((!http && !["git:", "ssh:"].includes(url.protocol)) ||
        (http && url.username) || url.password || url.search || url.hash)
      return null;
    const parts = url.pathname.replace(/^\/|\/$/g, "").replace(/\.git$/i, "")
      .split("/").map(decodeURIComponent);
    if (parts.length < 2 || parts.some((part) => !part || part === "." ||
        part === ".." || /[/\\\u0000-\u001f\u007f]/.test(part)))
      return null;
    const host = (http ? url.host : url.hostname).toLowerCase();
    if (!host) return null;
    const apiAddress = http ? url.origin : "https://" + host;
    return {
      key: host + "/" + parts.map(encodeURIComponent).join("/"),
      host, apiAddress, projectPath: parts.join("/"),
      credentialUrl: http ? url : new URL(url.pathname, apiAddress),
    };
  } catch {
    return null;
  }
}

export function gitLabApiAddress(value, repository) {
  try {
    const url = new URL(value);
    const registeredHttp = url.protocol === "http:" &&
      url.origin === repository.credentialUrl.origin;
    if ((!registeredHttp && url.protocol !== "https:") ||
        url.username || url.password || url.search || url.hash)
      throw new Error();
    const path = url.pathname.replace(/\/+$/, "").replace(/\/api\/v4$/, "");
    decodeURIComponent(path);
    return url.origin + path;
  } catch {
    throw new AppError("请输入 HTTPS 地址，或与登记仓库同源的 HTTP 地址。");
  }
}

function readCredential(url, signal) {
  const args = [
    "-c", "credential.interactive=false",
    "-c", "credential.provider=generic",
    "-c", "credential.allowWindowsAuth=false",
  ];
  // Allow the local lookup of an existing HTTP credential. API requests
  // are checked against the registered origin separately.
  if (url.protocol === "http:")
    args.push("-c", "credential.allowUnsafeRemotes=true");
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
      GCM_PROVIDER: "generic",
      GCM_ALLOW_WINDOWSAUTH: "false",
      GCM_TRACE: "0",
      GCM_TRACE_SECRETS: "0",
    };
    for (const name of Object.keys(env))
      if (name.startsWith("GIT_TRACE")) delete env[name];
    const child = execFile(
      "git", [...args, "credential", "fill"],
      { cwd: tmpdir(), windowsHide: true, timeout: 8000, maxBuffer: 65536, env, signal },
      (error, stdout) => {
        const password = /^password=(.+)$/m.exec(stdout)?.[1]?.trim();
        if (!error && password) return resolve(password);
        if (error?.code === "ENOENT")
          return reject(new AppError("工作台找不到 Git，请检查本机 Git 安装。", 503));
        reject(new AppError("本机 Git 凭据管理器未返回此仓库的 GitLab key。", 401));
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end("url=" + url.href + "\n\n");
  });
}

function requestError(error, signal) {
  if (signal.aborted || error.name === "TimeoutError")
    return new AppError("GitLab API 请求超时，请重新读取后再试。", 504);
  if (/CERT|ISSUER|SELF_SIGNED|SIGNATURE/.test(String(error.cause?.code)))
    return new AppError("GitLab HTTPS 证书校验失败，请检查当前使用的 GitLab 地址和证书。", 502);
  return new AppError("无法连接 GitLab API，请核对地址及网络。", 502);
}

export async function connectGitLab(repository, address, requestSignal) {
  const limit = AbortSignal.timeout(40000);
  const signal = requestSignal ? AbortSignal.any([limit, requestSignal]) : limit;
  const base = gitLabApiAddress(address, repository);
  const password = await readCredential(repository.credentialUrl, signal);

  async function request(path, body, method = "GET") {
    let response;
    try {
      response = await fetch(base + "/api/v4" + path, {
        method, signal, redirect: "error",
        headers: { "PRIVATE-TOKEN": password, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw requestError(error, signal);
    }
    if (response.status === 401)
      throw new AppError("GitLab API 拒绝了本机保存的 key，请核对有效期和 API 授权。", 401);
    if (response.status === 403)
      throw new AppError("当前 GitLab 账号没有此操作的 API 或项目权限。", 403);
    if (!response.ok)
      throw new AppError("GitLab API 请求失败（HTTP " + response.status + "）。", response.status);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AppError("GitLab API 返回了无法读取的数据，请核对连接地址。", 502);
    }
    return { data, nextPage: response.headers.get("x-next-page") };
  }

  async function list(path, query = {}) {
    const items = [];
    const pageSize = 100;
    for (let page = 1; page <= 100; page++) {
      const params = new URLSearchParams({ ...query, per_page: String(pageSize), page: String(page) });
      const { data, nextPage } = await request(path + "?" + params);
      if (!Array.isArray(data)) throw new AppError("GitLab 未返回有效的列表。", 502);
      items.push(...data);
      if (!data.length || nextPage === "" || (nextPage === null && data.length < pageSize)) return items;
    }
    throw new AppError("GitLab 列表分页超出读取范围。", 502);
  }

  const webPath = decodeURIComponent(new URL(base).pathname).replace(/^\/|\/$/g, "");
  const path = webPath && repository.projectPath.startsWith(webPath + "/")
    ? repository.projectPath.slice(webPath.length + 1)
    : repository.projectPath;
  return {
    project: () => request("/projects/" + encodeURIComponent(path)).then(({ data }) => data),
    get: (path) => request(path).then(({ data }) => data),
    post: (path, body) => request(path, body, "POST").then(({ data }) => data),
    put: (path, body) => request(path, body, "PUT").then(({ data }) => data),
    list,
  };
}
