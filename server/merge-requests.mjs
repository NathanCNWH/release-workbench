import { z } from "zod";
import { AppError, gitLabSettingsCollection } from "./store.mjs";
import { connectGitLab, gitLabApiAddress, gitLabRepository } from "./gitlab.mjs";
import { gitBranchName, parse } from "./validation.mjs";

const key = z.string().min(1).max(4000);
const id = z.string().min(1).max(300);
const userId = z.number().int().positive().safe();
const repositoryInput = z.object({ projectId: id, repositoryKey: key });
const addressInput = repositoryInput.extend({ apiAddress: z.string().trim().max(2000) });
const settingsInput = addressInput.extend({
  revision: z.number().int().nonnegative(),
  targetBranch: z.union([z.literal(""), gitBranchName]),
  assigneeId: userId.nullable(),
});
const versionInput = z.object({ projectId: id, versionId: id });
const submitInput = versionInput.extend({
  confirmed: z.literal(true),
  sourceBranch: gitBranchName,
  selections: z.array(z.object({
    repositoryKey: key,
    targetBranch: gitBranchName,
    assigneeId: userId,
    remember: z.boolean(),
    apiAddress: z.string().min(1).max(2000),
    gitLabProjectId: userId,
    reassign: z.object({ iid: userId, assigneeId: userId }).optional(),
  })).min(1).max(300),
});

function projectRepositories(store, projectId, serviceIds) {
  const project = store.get("projects").data.find((item) => item.id === projectId);
  if (!project) throw new AppError("项目不存在。", 404);
  const selected = serviceIds && new Set(serviceIds);
  const snapshot = store.get(gitLabSettingsCollection);
  const settings = snapshot.data.find((entry) => entry.projectId === projectId);
  const repositories = new Map();
  for (const service of project.services) {
    if (selected && !selected.has(service.id)) continue;
    const location = gitLabRepository(service.repository);
    const repositoryKey = location?.key ?? service.repository;
    let group = repositories.get(repositoryKey);
    if (!group) {
      const defaults = settings?.repositories.find((item) => item.key === repositoryKey);
      const address = settings?.connections.find((item) => item.host === location?.host)?.address ?? "";
      const apiAddress = address.startsWith("http://") && location?.credentialUrl.protocol !== "http:"
        ? "" : address;
      group = {
        location,
        repositoryKey,
        repository: service.repository,
        services: [],
        apiAddress,
        defaultApiAddress: location?.apiAddress ?? "",
        targetBranch: defaults?.targetBranch ?? "",
        defaultAssignee: defaults?.assignee ?? null,
      };
      repositories.set(repositoryKey, group);
    }
    group.services.push(service.name);
  }
  return { revision: snapshot.revision, repositories };
}

function updateSettings(store, projectId, update, expectedRevision) {
  const snapshot = store.get(gitLabSettingsCollection);
  if (expectedRevision !== undefined && expectedRevision !== snapshot.revision)
    throw new AppError("GitLab 设置已更新，请重新打开设置页。", 409);
  const settings = snapshot.data.find((entry) => entry.projectId === projectId)
    ?? { projectId, connections: [], repositories: [] };
  const updated = update(settings);
  if (updated === settings) return;
  store.save(gitLabSettingsCollection, [
    ...snapshot.data.filter((entry) => entry.projectId !== projectId), updated,
  ], snapshot.revision);
}

function setRepositoryDefaults(settings, key, fields) {
  const current = settings.repositories.find((item) => item.key === key);
  return {
    ...settings,
    repositories: [
      ...settings.repositories.filter((item) => item.key !== key),
      { ...current, key, ...fields },
    ],
  };
}

function repositoryView(target) {
  const { location, ...view } = target;
  return view;
}

function requireLocation(target) {
  if (!target?.location) throw new AppError("未找到可用的 GitLab 仓库地址。", 404);
  return target.location;
}

function accountView(account) {
  if (!userId.safeParse(account?.id).success || typeof account.username !== "string")
    return null;
  return {
    id: account.id,
    username: account.username,
    name: typeof account.name === "string" && account.name ? account.name : account.username,
  };
}

function webUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : "";
  } catch {
    return "";
  }
}

function mergeRequestView(mr, project) {
  if (!userId.safeParse(mr?.iid).success)
    throw new AppError("GitLab 未返回有效的 MR 编号。", 502);
  const projectUrl = webUrl(project.web_url);
  return {
    iid: mr.iid,
    targetBranch: mr.target_branch,
    url: webUrl(mr.web_url) ||
      (projectUrl ? projectUrl.replace(/\/$/, "") + "/-/merge_requests/" + mr.iid : ""),
    assignee: accountView(mr.assignee ?? mr.assignees?.[0]),
  };
}

function failure(error) {
  return error instanceof AppError ? error.message : "本次 GitLab 请求未完成，请重新读取后再试。";
}

async function openProject(target, address, signal) {
  const client = await connectGitLab(requireLocation(target), address, signal);
  const project = await client.project().catch((error) => {
    if (error.status === 404) throw new AppError("GitLab 中找不到此仓库，或当前账号无访问权限。", 404);
    throw error;
  });
  if (!userId.safeParse(project?.id).success)
    throw new AppError("GitLab 未返回有效的仓库 ID。", 502);
  const projectPath = "/projects/" + project.id;
  return { client, project, projectPath, mrPath: projectPath + "/merge_requests" };
}

async function projectMembers({ client, projectPath }) {
  const accounts = await client.list(projectPath + "/users");
  const members = new Map();
  for (const item of accounts) {
    if (item?.state && item.state !== "active") continue;
    const account = accountView(item);
    if (account) members.set(account.id, account);
  }
  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

async function requireBranch({ client, projectPath }, branch, label) {
  try {
    const result = await client.get(projectPath + "/repository/branches/" + encodeURIComponent(branch));
    if (result?.name !== branch) throw new AppError("GitLab 返回的分支名称与预览不一致。", 502);
  } catch (error) {
    if (error.status === 404)
      throw new AppError(label + "「" + branch + "」在远端不存在。", 404);
    throw error;
  }
}

async function openRequests({ client, project, mrPath }, sourceBranch, targetBranch) {
  const requests = await client.list(mrPath, { state: "opened", scope: "all" });
  return requests.filter((mr) => mr.state === "opened" && mr.source_branch === sourceBranch &&
    (!targetBranch || mr.target_branch === targetBranch) &&
    mr.source_project_id === project.id && mr.target_project_id === project.id);
}

const findOpen = async (remote, source, target) => (await openRequests(remote, source, target))[0];

async function readResult(remote, mr, status, expectedAssignee) {
  const result = mergeRequestView(mr, remote.project);
  try {
    const current = await remote.client.get(remote.mrPath + "/" + mr.iid);
    const latest = mergeRequestView(current, remote.project);
    if (expectedAssignee && latest.assignee?.id !== expectedAssignee)
      return { status: "pending", mr: latest, message: "MR 已存在，GitLab 尚未确认指定的合并人。" };
    return { status, mr: latest };
  } catch (error) {
    return { status: "pending", mr: result, message: "MR 已存在，回读结果失败。" + failure(error) };
  }
}

async function submitRepository(remote, version, choice) {
  const existing = await findOpen(remote, version.branchName, choice.targetBranch);
  if (existing) {
    const current = mergeRequestView(existing, remote.project);
    const assigneeId = current.assignee?.id;
    if (assigneeId === choice.assigneeId) return { status: "reused", mr: current };
    const expected = choice.reassign;
    if (expected && (expected.iid !== current.iid || expected.assigneeId !== assigneeId))
      return { status: "pending", mr: current, message: "已有 MR 或合并人发生变化，请重新读取后确认。" };
    if (assigneeId && !expected)
      return { status: "reused", mr: current, message: "已保留 GitLab 当前指派的合并人。" };
    try {
      const updated = await remote.client.put(remote.mrPath + "/" + current.iid, { assignee_id: choice.assigneeId });
      return await readResult(remote, updated, "assigned", choice.assigneeId);
    } catch (error) {
      return { status: "pending", mr: current, message: "补派结果待确认。" + failure(error) };
    }
  }
  if (choice.reassign)
    throw new AppError("原 MR 已关闭或发生变化，请重新读取后确认。", 409);
  let created;
  try {
    created = await remote.client.post(remote.mrPath, {
      source_branch: version.branchName,
      target_branch: choice.targetBranch,
      title: version.title || version.name,
      assignee_id: choice.assigneeId,
    });
    if (!userId.safeParse(created?.iid).success)
      throw new AppError("创建请求已返回，MR 编号待确认。", 502);
  } catch (error) {
    const recovered = await findOpen(remote, version.branchName, choice.targetBranch).catch(() => null);
    if (recovered) return readResult(remote, recovered, "reused", choice.assigneeId);
    if (error.status >= 500 || error.status === 408)
      return { status: "pending", message: "创建结果待确认，请重新读取 GitLab。" + failure(error) };
    throw error;
  }
  return readResult(remote, created, "created", choice.assigneeId);
}

export class MergeRequests {
  #active = new Set();

  constructor(store) {
    this.store = store;
  }

  settings(projectId) {
    const { revision, repositories } = projectRepositories(this.store, parse(id, projectId));
    return {
      revision,
      repositories: [...repositories.values()].filter((target) => target.location).map(repositoryView),
    };
  }

  getRepository({ projectId, repositoryKey }) {
    const target = projectRepositories(this.store, projectId).repositories.get(repositoryKey);
    requireLocation(target);
    return target;
  }

  async check(raw, signal) {
    const input = parse(addressInput, raw);
    const target = this.getRepository(input);
    const remote = await openProject(target, input.apiAddress || target.defaultApiAddress, signal);
    const [account, members] = await Promise.all([
      remote.client.get("/user").then(accountView),
      projectMembers(remote),
    ]);
    if (!account) throw new AppError("GitLab 未返回当前账号。", 502);
    return { account, members, targetBranch: remote.project.default_branch || "master" };
  }

  async save(raw) {
    const input = parse(settingsInput, raw);
    const target = this.getRepository(input);
    const address = input.apiAddress ? gitLabApiAddress(input.apiAddress, target.location) : "";
    let assignee = input.assigneeId === null ? null : target.defaultAssignee;
    if (input.assigneeId !== null && input.assigneeId !== assignee?.id) {
      const remote = await openProject(target, address || target.defaultApiAddress);
      assignee = (await projectMembers(remote)).find((member) => member.id === input.assigneeId);
      if (!assignee) throw new AppError("所选合并人已不在仓库可用成员中。");
    }
    updateSettings(this.store, input.projectId, (settings) => ({
      ...setRepositoryDefaults(settings, input.repositoryKey, { targetBranch: input.targetBranch, assignee }),
      connections: [
        ...settings.connections.filter((item) => item.host !== target.location.host),
        ...(address ? [{ host: target.location.host, address }] : []),
      ],
    }), input.revision);
    return this.settings(input.projectId);
  }

  version({ projectId, versionId }) {
    const version = this.store.get("releases").data.find((item) =>
      item.id === versionId && item.projectId === projectId && !item.hidden);
    if (!version) throw new AppError("版本不存在或已隐藏。", 404);
    if (!gitBranchName.safeParse(version.branchName).success)
      throw new AppError("请先给这个版本登记开发分支。");
    const { repositories } = projectRepositories(this.store, projectId, version.serviceIds ?? []);
    if (!repositories.size) throw new AppError("请先在版本中选择涉及服务。");
    return { version, repositories };
  }

  async preview(raw, signal) {
    const input = parse(versionInput, raw);
    const { version, repositories } = this.version(input);
    const rows = [];
    const targets = [...repositories.values()];
    for (let offset = 0; offset < targets.length; offset += 4) {
      const batch = targets.slice(offset, offset + 4);
      rows.push(...await Promise.all(batch.map(async (target) => {
        const view = repositoryView(target);
        try {
          const remote = await openProject(target, view.apiAddress || view.defaultApiAddress, signal);
          const [members, requests] = await Promise.all([
            projectMembers(remote),
            openRequests(remote, version.branchName),
            requireBranch(remote, version.branchName, "源分支"),
          ]);
          return {
            ...view,
            gitLabProjectId: remote.project.id,
            targetBranch: view.targetBranch || remote.project.default_branch || "master",
            members,
            existing: requests.map((mr) => mergeRequestView(mr, remote.project)),
          };
        } catch (error) {
          return { ...view, error: failure(error) };
        }
      })));
      if (signal?.aborted) break;
    }
    return { sourceBranch: version.branchName, rows };
  }

  async submit(raw) {
    const input = parse(submitInput, raw);
    const { version, repositories } = this.version(input);
    if (version.branchName !== input.sourceBranch)
      throw new AppError("版本开发分支已变化，请重新预览。", 409);
    const selected = new Set(input.selections.map((choice) => choice.repositoryKey));
    if (selected.size !== input.selections.length || [...selected].some((key) => !repositories.has(key)))
      throw new AppError("涉及仓库已变化，请重新预览。", 409);
    const results = [];
    for (const choice of input.selections) {
      const target = repositories.get(choice.repositoryKey);
      const { repository, repositoryKey } = target;
      const summary = { repository, repositoryKey, targetBranch: choice.targetBranch };
      const task = JSON.stringify([repositoryKey, version.branchName, choice.targetBranch]);
      if (this.#active.has(task)) {
        results.push({ ...summary, status: "pending", message: "此 MR 正在提交，请稍后重新读取。" });
        continue;
      }
      this.#active.add(task);
      try {
        const address = target.apiAddress || target.defaultApiAddress;
        if (address !== choice.apiAddress)
          throw new AppError("GitLab 连接已更改，请重新预览。", 409);
        if (version.branchName === choice.targetBranch)
          throw new AppError("源分支和目标分支必须不同。");
        const remote = await openProject(target, address);
        if (remote.project.id !== choice.gitLabProjectId)
          throw new AppError("GitLab 仓库已更改，请重新预览。", 409);
        const [members] = await Promise.all([
          projectMembers(remote),
          requireBranch(remote, version.branchName, "源分支"),
          requireBranch(remote, choice.targetBranch, "目标分支"),
        ]);
        const member = members.find((user) => user.id === choice.assigneeId);
        if (!member) throw new AppError("所选合并人已不在仓库可用成员中。");
        updateSettings(this.store, input.projectId, (settings) => {
          const current = settings.repositories.find((item) => item.key === repositoryKey);
          return !current?.assignee || choice.remember
            ? setRepositoryDefaults(settings, repositoryKey, { assignee: member })
            : settings;
        });
        results.push({ ...summary, ...await submitRepository(remote, version, choice) });
      } catch (error) {
        results.push({ ...summary, status: "failed", message: failure(error) });
      } finally {
        this.#active.delete(task);
      }
    }
    return { results };
  }
}
