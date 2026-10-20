import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

export function acquireLock(directory, instanceId) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, ".instance-lock");
  const write = () =>
    writeFileSync(file, JSON.stringify({ pid: process.pid, instanceId }), {
      flag: "wx",
      mode: 0o600,
    });
  try {
    write();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let existing;
    try {
      existing = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw new Error(`数据目录锁文件损坏，请先核对 ${file}`);
    }
    if (!Number.isSafeInteger(existing.pid) || existing.pid <= 0)
      throw new Error("数据目录锁包含无效进程，请核对后处理");
    let alive = true;
    try {
      process.kill(existing.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        `此数据目录已由进程 ${existing.pid} 使用，请停止原实例后再启动，不能同时运行两个发布监视器。`,
      );
    unlinkSync(file);
    write();
  }
  return () => {
    try {
      if (JSON.parse(readFileSync(file, "utf8")).instanceId === instanceId)
        unlinkSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
}
