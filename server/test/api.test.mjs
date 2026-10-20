import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApp } from "../index.mjs";
import { seed, temporary } from "./helpers.mjs";

test("API rejects foreign origins, saves revisions, exports backups without credentials and serves real MCP tools", async () => {
  const temp = await temporary(),
    app = await createApp({ directory: temp.path, port: 0, serveFiles: false });
  const base = `http://127.0.0.1:${app.port}`;
  let client;
  try {
    seed(app.store, "http://127.0.0.1:1");
    await assert.rejects(
      createApp({ directory: temp.path, port: 0 }),
      /已由进程/,
    );
    const foreign = await fetch(`${base}/api/backups/workspace`, {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
        "X-Workbench-Client": "local",
      },
      body: "{}",
    });
    assert.equal(foreign.status, 403);
    const missing = await fetch(`${base}/api/backups/workspace`, {
      method: "POST",
    });
    assert.equal(missing.status, 403);
    const headers = {
      Origin: base,
      "Content-Type": "application/json",
      "X-Workbench-Client": "local",
    };
    const saved = await fetch(`${base}/api/state/projects`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        data: app.store.get("projects").data,
        revision: 0,
      }),
    });
    assert.equal(saved.status, 409);
    const backup = await fetch(`${base}/api/backups/workspace`, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(backup.status, 201);
    const record = await backup.json(),
      download = await fetch(`${base}/api/backups/${record.id}/download`),
      exported = await download.text();
    assert.equal(exported.includes("fixture-secret-token"), false);
    assert.equal(JSON.parse(exported).format, "release-workbench-v1");
    assert.equal(
      (
        await fetch(`${base}/api/sql/execute`, {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      404,
    );
    const token = (
      await readFile(resolve(temp.path, ".api-token"), "utf8")
    ).trim();
    client = new Client({ name: "controlled-test", version: "1.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("server/mcp.mjs")],
      env: { ...process.env, RW_BASE_URL: base, RW_API_TOKEN: token },
      stderr: "pipe",
    });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "deployment_run"));
    const projects = await client.callTool({
      name: "projects_list",
      arguments: {},
    });
    assert.equal(projects.isError, undefined);
    assert.ok(projects.content[0].text.includes("受控测试项目"));
    const wrong = await client.callTool({
      name: "deployment_preview",
      arguments: {
        projectId: "p1",
        environmentId: "e1",
        selections: [{ serviceId: "wrong" }],
      },
    });
    assert.equal(wrong.isError, true);
    await client.close();
    client = null;
  } finally {
    if (client) await client.close();
    await app.stop();
    await temp.clean();
  }
});
