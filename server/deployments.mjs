import { randomUUID, createHash } from "node:crypto";
import { AppError } from "./store.mjs";
import { Jenkins, jobUrl } from "./jenkins.mjs";
import { parameters } from "./validation.mjs";
import { mergeVersions } from "./versions.mjs";

export const terminal = (status) =>
  ["成功", "失败", "部分失败", "已中止", "结果未知"].includes(status);
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class Deployments {
  constructor(
    store,
    {
      pollMs = 2500,
      timeoutMs = 6 * 60 * 60 * 1000,
      client = (profile, token) => new Jenkins(profile, token),
    } = {},
  ) {
    this.store = store;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
    this.client = client;
    this.active = new Set();
    this.timer = null;
  }
  inputs(input) {
    const { projectId, environmentId, selections } = input;
    const project = this.store
      .get("projects")
      .data.find((p) => p.id === projectId);
    const environment = this.store
      .get("environments")
      .data.find((e) => e.id === environmentId && e.projectId === projectId);
    if (!project || !environment) throw new AppError("项目或环境不存在");
    const versionSnapshot = mergeVersions(this.store, input);
    if (versionSnapshot.unresolved)
      throw new AppError("版本资料存在未处理冲突，请先完成合并选择");
    const versionIds = versionSnapshot.versions.map((v) => v.id);
    if (
      !Array.isArray(selections) ||
      !selections.length ||
      selections.length > 300 ||
      selections.some(
        (selection) =>
          !selection ||
          typeof selection !== "object" ||
          typeof selection.serviceId !== "string" ||
          (selection.branch !== undefined &&
            typeof selection.branch !== "string"),
      ) ||
      new Set(selections.map((s) => s.serviceId)).size !== selections.length
    )
      throw new AppError("请选择一个或多个不重复的服务");
    const profiles = this.store.get("jenkinsProfiles").data;
    const services = selections.map((selection) => {
      const service = project.services.find(
        (s) => s.id === selection.serviceId,
      );
      const binding = environment.bindings.find(
        (b) => b.serviceId === selection.serviceId,
      );
      if (!service || !binding?.job)
        throw new AppError("所选服务不属于当前项目，或尚未绑定目标环境 Job");
      const profile = profiles.find(
        (p) => p.id === (service.kind === "前端应用" ? "frontend" : "backend"),
      );
      if (
        !profile?.url ||
        !profile.username ||
        !this.store.hasSecret(`jenkins:${profile.id}`)
      )
        throw new AppError(
          `${profile?.name || "Jenkins"} 地址、账号或 Token 未配置`,
        );
      const branch = binding.supportsBranch
        ? selection.branch || binding.defaultBranch
        : selection.branch || "";
      const params = parameters(binding, branch);
      return {
        serviceId: service.id,
        name: service.name,
        repository: service.repository,
        kind: service.kind,
        profileId: profile.id,
        jenkinsName: profile.name,
        jenkinsUrl: profile.url,
        jenkinsUser: profile.username,
        job: binding.job,
        servers: environment.servers
          .filter((server) => (binding.serverIds || []).includes(server.id))
          .map(({ id, name, host, port, username, authentication }) => ({
            id,
            name,
            host,
            port,
            username: authentication === "environment" ? "" : username,
            authentication,
          })),
        branch,
        branchParameter: binding.supportsBranch ? binding.branchParameter : "",
        parameters: Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n"),
        params,
        authHash: fingerprint(this.store.secret(`jenkins:${profile.id}`)),
        status: "待提交",
        buildNumber: 0,
        consoleUrl: "",
        log: "",
      };
    });
    return {
      projectId,
      environmentId,
      versionId: versionIds.length === 1 ? versionIds[0] : null,
      versionIds,
      versionSnapshot,
      deployPath: environment.deployPath,
      projectName: project.name,
      environmentName: environment.name,
      versionName: versionSnapshot.versions
        .map((version) => version.name)
        .join(" + "),
      services,
    };
  }
  publicPlan(plan) {
    return { ...plan, services: plan.services.map(({ authHash, ...s }) => s) };
  }
  preview(input) {
    const inputs = this.inputs(input);
    const plan = {
      ...inputs,
      id: randomUUID(),
      selections: input.selections,
      resolutions: input.resolutions || {},
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      fingerprint: fingerprint(inputs),
    };
    this.store.createPlan(plan);
    return this.publicPlan(plan);
  }
  run(planId, actor = "本地用户") {
    const { record, created } = this.store.claimPlan(planId, (plan) => {
      if (fingerprint(this.inputs(plan)) !== plan.fingerprint)
        throw new AppError(
          "版本资料、服务、环境或 Jenkins 配置已变化，请重新预览。",
          409,
        );
      const locked = this.store
        .list("deployments")
        .some(
          (d) =>
            !terminal(d.status) &&
            d.services.some((a) =>
              plan.services.some(
                (b) => a.jenkinsUrl === b.jenkinsUrl && a.job === b.job,
              ),
            ),
        );
      if (locked)
        throw new AppError(
          "所选 Jenkins 任务仍有未完成发布，请查看记录后再操作。",
          409,
        );
      return {
        id: `DEP-${randomUUID()}`,
        projectId: plan.projectId,
        environmentId: plan.environmentId,
        versionId: plan.versionId,
        versionIds: plan.versionIds,
        versionSnapshot: plan.versionSnapshot,
        deployPath: plan.deployPath,
        projectName: plan.projectName,
        environmentName: plan.environmentName,
        versionName: plan.versionName,
        status: "排队中",
        started: new Date().toISOString(),
        duration: "进行中",
        actor,
        steps: [],
        services: plan.services.map(({ authHash, ...s }) => s),
      };
    });
    if (created) void this.tick();
    return record;
  }
  aggregate(record) {
    const states = record.services.map((s) => s.status);
    if (states.some((s) => !terminal(s)))
      record.status = states.includes("构建中") ? "构建中" : "排队中";
    else if (states.every((s) => s === "成功")) record.status = "成功";
    else if (states.includes("结果未知")) record.status = "结果未知";
    else if (states.includes("成功")) record.status = "部分失败";
    else if (states.every((s) => s === "已中止")) record.status = "已中止";
    else record.status = "失败";
    if (terminal(record.status))
      record.duration = `${Math.max(1, Math.round((Date.now() - Date.parse(record.started)) / 1000))} 秒`;
    return record;
  }
  async tick() {
    for (const record of this.store
      .list("deployments")
      .filter((d) => !terminal(d.status)))
      for (const service of record.services) {
        const key = `${record.id}:${service.serviceId}`;
        if (this.active.has(key) || terminal(service.status)) continue;
        this.active.add(key);
        void this.advance(record.id, service.serviceId).finally(() =>
          this.active.delete(key),
        );
      }
  }
  saveService(id, serviceId, update) {
    const record = this.store.deployment(id);
    record.services = record.services.map((s) =>
      s.serviceId === serviceId ? { ...s, ...update } : s,
    );
    this.store.record("deployments", id, this.aggregate(record));
  }
  async advance(id, serviceId) {
    const record = this.store.deployment(id),
      service = record.services.find((s) => s.serviceId === serviceId);
    const token = this.store.secret(`jenkins:${service.profileId}`);
    const client = this.client(
      { url: service.jenkinsUrl, username: service.jenkinsUser },
      token,
    );
    try {
      if (service.status === "待提交") {
        // Persist the uncertain boundary before the non-idempotent remote POST.
        this.saveService(id, serviceId, {
          status: "提交中",
          log: "正在向 Jenkins 提交；此阶段中断后不会自动重放。",
        });
        let queueUrl;
        try {
          queueUrl = await client.trigger(service.job, service.params);
        } catch (error) {
          this.saveService(id, serviceId, {
            status: error.remoteRejected ? "失败" : "结果未知",
            log: this.store.redact(
              `${error.message}\n${error.remoteRejected ? "Jenkins 明确拒绝任务，请修正配置后重新预览。" : "请先在 Jenkins 核对任务是否已触发，系统不会自动重试 POST。"}`,
            ),
          });
          return;
        }
        this.saveService(id, serviceId, {
          status: "排队中",
          queueUrl,
          log: "Jenkins 已接受任务，正在等待队列分配构建。",
        });
        return;
      }
      if (Date.now() - Date.parse(record.started) > this.timeoutMs) {
        this.saveService(id, serviceId, {
          status: "结果未知",
          log: "等待构建超过上限，请到 Jenkins 核对真实结果。",
        });
        return;
      }
      if (service.queueUrl && !service.buildUrl) {
        const queue = await client.queue(service.queueUrl);
        if (queue.cancelled) {
          this.saveService(id, serviceId, {
            status: "已中止",
            log: "任务在 Jenkins 队列中被取消。",
          });
          return;
        }
        if (!queue.executable?.url) return;
        const buildUrl = client.safeUrl(queue.executable.url);
        this.saveService(id, serviceId, {
          status: "构建中",
          buildUrl,
          buildNumber: queue.executable.number,
          consoleUrl: `${buildUrl.replace(/\/$/, "")}/console`,
          log: "构建已开始，正在等待最终结果。",
        });
        return;
      }
      if (service.buildUrl) {
        const build = await client.build(service.buildUrl);
        if (build.building || !build.result) return;
        let log;
        try {
          log = this.store.redact(await client.logs(service.buildUrl));
        } catch {
          log = "构建结果已获取，日志暂不可读，请打开 Jenkins 控制台。";
        }
        const status =
          build.result === "SUCCESS"
            ? "成功"
            : build.result === "ABORTED"
              ? "已中止"
              : "失败";
        this.saveService(id, serviceId, {
          status,
          jenkinsResult: build.result,
          log,
          completedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.saveService(id, serviceId, {
        lastError: this.store.redact(error.message),
        log: this.store.redact(error.message),
      });
    }
  }
  start() {
    for (const record of this.store.list("deployments")) {
      if (record.services.some((s) => s.status === "提交中")) {
        record.services = record.services.map((s) =>
          s.status === "提交中"
            ? {
                ...s,
                status: "结果未知",
                log: "应用在提交 Jenkins 时退出，请先核对远端任务，避免重复发布。",
              }
            : s,
        );
        this.store.record("deployments", record.id, this.aggregate(record));
      }
    }
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref();
    void this.tick();
  }
  stop() {
    clearInterval(this.timer);
  }
  async refresh(id) {
    const record = this.store.deployment(id);
    for (const service of record.services.filter(
      (s) => s.status === "结果未知" && (s.queueUrl || s.buildUrl),
    ))
      this.saveService(id, service.serviceId, {
        status: service.buildUrl ? "构建中" : "排队中",
      });
    await this.tick();
    return this.store.deployment(id);
  }
  async logs(id, serviceId) {
    const record = this.store.deployment(id),
      service = record.services.find((s) => s.serviceId === serviceId);
    if (!service) throw new AppError("服务记录不存在", 404);
    if (!service.buildUrl)
      return { log: service.log, consoleUrl: service.consoleUrl };
    const client = this.client(
      { url: service.jenkinsUrl, username: service.jenkinsUser },
      this.store.secret(`jenkins:${service.profileId}`),
    );
    return {
      log: this.store.redact(await client.logs(service.buildUrl)),
      consoleUrl: service.consoleUrl,
    };
  }
}
