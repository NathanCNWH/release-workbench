import { AppError } from "./store.mjs";
import { validJenkinsUrl } from "./validation.mjs";

export function jobUrl(base, path) {
  return `${validJenkinsUrl(base)}/${path
    .split("/")
    .map((p) => `job/${encodeURIComponent(p)}`)
    .join("/")}/`;
}
export class Jenkins {
  constructor(profile, token, { timeout = 15000 } = {}) {
    this.base = validJenkinsUrl(profile.url);
    this.profile = profile;
    this.token = token;
    this.timeout = timeout;
  }
  safeUrl(value) {
    const url = new URL(value, `${this.base}/`),
      base = new URL(`${this.base}/`);
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      url.username ||
      url.password
    )
      throw new AppError("Jenkins 返回了站点范围之外的链接，已拒绝跟随");
    return url.href;
  }
  async request(url, options = {}) {
    const headers = {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${this.profile.username}:${this.token}`).toString("base64")}`,
      ...options.headers,
    };
    try {
      return await fetch(this.safeUrl(url), {
        ...options,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch {
      throw new AppError(
        "无法连接 Jenkins 或请求超时，请检查地址、网络与证书。",
        502,
      );
    }
  }
  async json(url) {
    const response = await this.request(url);
    if (!response.ok)
      throw new AppError(
        `Jenkins 请求失败（HTTP ${response.status}），请检查地址、账号权限和 Token。`,
        502,
      );
    try {
      return await response.json();
    } catch {
      throw new AppError(
        "Jenkins 返回的不是 JSON，请检查是否被重定向到登录页或代理页面。",
        502,
      );
    }
  }
  async check() {
    const value = await this.json(`${this.base}/api/json?tree=nodeName,mode`);
    return {
      ok: true,
      nodeName: value.nodeName || "Jenkins",
      checkedAt: new Date().toISOString(),
    };
  }
  async metadata(path) {
    const result = await this.json(
      `${jobUrl(this.base, path)}api/json?tree=name,buildable,property[parameterDefinitions[name,type,choices,defaultParameterValue[value]]],actions[parameterDefinitions[name,type,choices,defaultParameterValue[value]]]`,
    );
    const parameters = [
      ...(result.property || []),
      ...(result.actions || []),
    ].flatMap((p) => p.parameterDefinitions || []);
    return {
      name: result.name,
      buildable: result.buildable,
      parameters: parameters.map((p) => {
        const secret = /password|secret/i.test(`${p.type} ${p.name}`);
        return {
          name: p.name,
          type: p.type,
          choices: !secret && Array.isArray(p.choices) ? p.choices : [],
          defaultValue: secret ? "" : (p.defaultParameterValue?.value ?? ""),
        };
      }),
    };
  }
  async trigger(path, params) {
    const parameterized = Object.keys(params).length > 0;
    const url = `${jobUrl(this.base, path)}${parameterized ? "buildWithParameters" : "build"}`;
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    };
    let response = await this.request(url, options);
    if (response.status === 403) {
      // Older installations may require a session crumb even when using API tokens.
      const crumbResponse = await this.request(
        `${this.base}/crumbIssuer/api/json`,
      );
      if (crumbResponse.ok) {
        const crumb = await crumbResponse.json();
        const cookie = (crumbResponse.headers.getSetCookie?.() || [])
          .map((v) => v.split(";")[0])
          .join("; ");
        if (
          typeof crumb.crumbRequestField === "string" &&
          typeof crumb.crumb === "string"
        )
          response = await this.request(url, {
            ...options,
            headers: {
              ...options.headers,
              [crumb.crumbRequestField]: crumb.crumb,
              ...(cookie ? { Cookie: cookie } : {}),
            },
          });
      }
    }
    if (![200, 201, 202].includes(response.status)) {
      const error = new AppError(
        `Jenkins 未接受构建（HTTP ${response.status}）。请检查任务路径、参数和 Build 权限。`,
        502,
      );
      error.remoteRejected = [400, 401, 403, 404, 405].includes(
        response.status,
      );
      throw error;
    }
    const location = response.headers.get("location");
    if (!location)
      throw new AppError(
        "Jenkins 已接收请求但未返回队列地址，结果未知。请到 Jenkins 核对，勿直接重复触发。",
        502,
      );
    return this.safeUrl(location);
  }
  async queue(url) {
    return this.json(`${this.safeUrl(url).replace(/\/$/, "")}/api/json`);
  }
  async build(url) {
    return this.json(
      `${this.safeUrl(url).replace(/\/$/, "")}/api/json?tree=number,building,result,duration,url`,
    );
  }
  async logs(url) {
    const response = await this.request(
      `${this.safeUrl(url).replace(/\/$/, "")}/logText/progressiveText?start=0`,
    );
    if (!response.ok)
      throw new AppError(`构建日志读取失败（HTTP ${response.status}）`, 502);
    const reader = response.body.getReader();
    let output = "",
      size = 0;
    const decoder = new TextDecoder();
    try {
      while (size < 256000) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        output += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    return (
      output.slice(0, 256000) +
      (size >= 256000
        ? "\n[页面仅显示日志前 256 KB，请打开 Jenkins 查看完整日志]"
        : "")
    );
  }
}
