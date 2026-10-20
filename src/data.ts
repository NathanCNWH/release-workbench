import type { Release, DeployStep } from "./types";

export const planSteps: DeployStep[] = [
  {
    name: "选择环境和服务",
    detail: "读取已绑定的 Jenkins Job 与固定参数",
    state: "成功",
  },
  {
    name: "确认分支与参数",
    detail: "只有支持分支参数的 Job 才传入所选分支",
    state: "成功",
  },
  {
    name: "触发 Jenkins Job",
    detail: "按服务类型使用全局前端或后端账号，记录队列号",
    state: "成功",
  },
  {
    name: "等待构建并记录结果",
    detail: "获取构建编号、最终结果和控制台日志地址",
    state: "成功",
  },
];

export function nextVersion(all: Release[], projectId: string) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" })
    .format(new Date())
    .replaceAll("-", "");
  const suffixes = all
    .filter((v) => v.projectId === projectId && v.name.startsWith(day + "-"))
    .map((v) => Number(v.name.slice(day.length + 1)))
    .filter(Number.isFinite);
  return `${day}-${String(Math.max(0, ...suffixes) + 1).padStart(2, "0")}`;
}
