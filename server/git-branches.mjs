import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { AppError } from "./store.mjs";
import { parse, releaseBranch } from "./validation.mjs";

const execute = promisify(execFile);
const gitEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "Never",
  GIT_ALLOW_PROTOCOL: "http:https:ssh:git",
};
for (const key of [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_SHALLOW_FILE",
]) {
  delete gitEnv[key];
}

const inputSchema = z.object({
  projectId: z.string().min(1),
  branchName: releaseBranch,
  serviceIds: z.array(z.string().min(1)).min(1, "请选择涉及服务").max(300),
});
const masterRef = "refs/heads/master";
const localMaster = "refs/workbench/master";
const localBranch = "refs/workbench/branch";

function gitError(error, signal) {
  if (signal.aborted) return "读取 Git 仓库超时。";
  if (error.code === "ENOENT") return "工作台找不到 Git，请检查安装和 PATH。";
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
    return "提交历史输出超出检测容量。";
  const stderr = String(error.stderr || "");
  if (/authentication failed|permission denied|could not read username|publickey|access denied/i.test(stderr))
    return "Git 认证或访问权限不足，请检查本机 Git 凭据。";
  if (/could not resolve|unable to access|failed to connect|connection timed out|host key verification failed/i.test(stderr))
    return "无法连接 Git 仓库，请检查网络和 Git 连接配置。";
  return "无法读取 Git 仓库，请检查地址和访问权限。";
}

async function inspectRepository(target, branchName, cutoff, requestSignal) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(35000)]);
  let directory;
  try {
    signal.throwIfAborted();
    directory = await mkdtemp(resolve(tmpdir(), "release-workbench-git-"));
    const git = async (...args) =>
      (await execute("git", args, {
        cwd: directory,
        env: gitEnv,
        signal,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      })).stdout.trim();
    const remoteBranch = `refs/heads/${branchName}`;
    const refs = new Set(
      (await git("ls-remote", "--refs", "--", target.repository, masterRef, remoteBranch))
        .split(/\r?\n/)
        .map((line) => line.split("\t")[1]),
    );
    const targetExists = refs.has(remoteBranch);
    const masterExists = refs.has(masterRef);
    if (!targetExists || !masterExists)
      return { ...target, kind: "missing", targetExists, masterExists };

    await git("init", "--bare", "--template=");
    await git(
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      "--no-auto-maintenance",
      "--filter=blob:none",
      "--",
      target.repository,
      `${masterRef}:${localMaster}`,
      `${remoteBranch}:${localBranch}`,
    );
    const bases = await git("merge-base", "--all", localMaster, localBranch)
      .catch((error) => {
        if (error.code === 1) return "";
        throw error;
      });
    const [masterOnly, branchOnly] = (
      await git("rev-list", "--left-right", "--count", `${localMaster}...${localBranch}`)
    ).split(/\s+/).map(Number);
    const history = await git("rev-list", "--timestamp", `${localMaster}..${localBranch}`);
    const early = history
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [timestamp, id] = line.split(" ");
        return { id, timestamp: Number(timestamp) };
      })
      .filter((commit) => commit.timestamp < cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
    return {
      ...target,
      kind: "compared",
      commonAncestors: bases ? bases.split(/\r?\n/) : [],
      masterOnly,
      branchOnly,
      earlyCount: early.length,
      earlyCommits: early.slice(0, 10).map(({ id, timestamp }) => ({
        id,
        committedAt: new Date(timestamp * 1000).toISOString(),
      })),
    };
  } catch (error) {
    return { ...target, kind: "error", message: gitError(error, signal) };
  } finally {
    if (directory)
      await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

export async function checkVersionBranches(store, input, signal) {
  const { projectId, branchName, serviceIds } = parse(inputSchema, input);
  const project = store.get("projects").data.find((item) => item.id === projectId);
  if (!project) throw new AppError("项目不存在。", 404);
  const selected = new Set(serviceIds);
  const services = project.services.filter((item) => selected.has(item.id));
  if (services.length !== selected.size)
    throw new AppError("所选服务已变化，请重新选择。");

  const repositories = new Map();
  for (const service of services) {
    const group = repositories.get(service.repository) ?? {
      repository: service.repository,
      services: [],
    };
    group.services.push(service.name);
    repositories.set(service.repository, group);
  }
  const day = branchName.slice("feature/zy_".length, "feature/zy_".length + 8);
  const branchDate = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
  const cutoff = Date.parse(`${branchDate}T00:00:00+08:00`) / 1000;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(90000)]);
  const repositoriesToCheck = [...repositories.values()];
  const results = [];
  for (let offset = 0; offset < repositoriesToCheck.length; offset += 3) {
    const batch = repositoriesToCheck.slice(offset, offset + 3);
    const checked = await Promise.all(
      batch.map((target) =>
        inspectRepository(target, branchName, cutoff, deadline),
      ),
    );
    results.push(...checked);
  }
  return { branchName, branchDate, results };
}
