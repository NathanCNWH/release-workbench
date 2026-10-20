import { spawn } from "node:child_process";
import { resolve } from "node:path";
const children = [
  spawn(process.execPath, ["server/index.mjs"], {
    stdio: "inherit",
    env: { ...process.env, RW_PORT: "4175" },
  }),
  spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: "inherit" },
  ),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
