import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApp } from "../index.mjs";
import { temporary } from "./helpers.mjs";

test("MCP manages all six business entities with revisions and reference protections", async () => {
  const temp = await temporary(),
    app = await createApp({ directory: temp.path, port: 0, serveFiles: false });
  const client = new Client({ name: "management-test", version: "1.0" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve("server/mcp.mjs")],
        env: {
          ...process.env,
          RW_BASE_URL: `http://127.0.0.1:${app.port}`,
          RW_API_TOKEN: (
            await readFile(resolve(temp.path, ".api-token"), "utf8")
          ).trim(),
        },
        stderr: "pipe",
      }),
    );
    async function raw(name, args) {
      return client.callTool({ name, arguments: args });
    }
    async function call(name, args) {
      const result = await raw(name, args);
      assert.equal(result.isError, undefined, result.content[0].text);
      return JSON.parse(result.content[0].text);
    }
    async function create(scope, data) {
      const { revision } = await call("records_list", scope);
      return (await call("record_create", { ...scope, revision, data })).record;
    }
    async function update(scope, id, data) {
      const { revision } = await call("records_list", scope);
      return call("record_update", { ...scope, recordId: id, revision, data });
    }
    async function remove(scope, id) {
      const { revision } = await call("records_list", scope);
      return call("record_delete", {
        ...scope,
        recordId: id,
        revision,
        confirmed: true,
      });
    }
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "version_merge"));
    const workspaceBackup = await fetch(
      `http://127.0.0.1:${app.port}/api/backups/workspace`,
      {
        method: "POST",
        headers: {
          Origin: `http://127.0.0.1:${app.port}`,
          "X-Workbench-Client": "local",
        },
      },
    );
    assert.equal(workspaceBackup.status, 201);
    const project = await create(
      { entity: "project" },
      { name: "MCP 项目", key: "mcp" },
    );
    const scope = { projectId: project.id };
    const service = await create(
      { ...scope, entity: "service" },
      { name: "api", repository: "https://git.example.com/api.git" },
    );
    const environment = await create(
      { ...scope, entity: "environment" },
      { name: "测试", key: "test" },
    );
    assert.equal(environment.servers.length, 0);
    const version = await create(
      { ...scope, entity: "version" },
      { name: "20261021-01" },
    );
    assert.equal(version.components.length, 0);
    const sqlScope = { ...scope, versionId: version.id, entity: "sql" },
      configScope = { ...scope, versionId: version.id, entity: "config" };
    const sql = await create(sqlScope, {
      name: "001.sql",
      database: "test",
      sql: "SELECT 1;",
    });
    const config = await create(configScope, {
      name: "application.yml",
      path: "/opt/config/application.yml",
      content: "feature: false",
    });
    for (const [entityScope, record, data] of [
      [{ entity: "project" }, project, { description: "updated" }],
      [{ ...scope, entity: "service" }, service, { defaultBranch: "test" }],
      [
        { ...scope, entity: "environment" },
        environment,
        {
          servers: [
            {
              id: "node",
              name: "节点",
              host: "192.0.2.10",
              port: "22",
              authentication: "environment",
            },
          ],
          bindings: [
            {
              serviceId: service.id,
              serverIds: ["node"],
              job: "",
              parameters: "",
              supportsBranch: false,
              branchParameter: "",
              branches: [],
              defaultBranch: "",
            },
          ],
        },
      ],
      [
        { ...scope, entity: "version" },
        version,
        { title: "更新资料", serviceIds: [service.id] },
      ],
      [sqlScope, sql, { sql: "SELECT 2;" }],
      [configScope, config, { content: "feature: true" }],
    ]) {
      await update(entityScope, record.id, data);
      const read = await call("record_get", {
        ...entityScope,
        recordId: record.id,
      });
      const subset = (actual, expected) => {
        if (Array.isArray(expected)) {
          assert.equal(actual.length, expected.length);
          expected.forEach((value, index) => subset(actual[index], value));
        } else if (expected && typeof expected === "object")
          for (const [key, value] of Object.entries(expected))
            subset(actual[key], value);
        else assert.deepEqual(actual, expected);
      };
      subset(read.record, data);
    }
    const stale = await raw("record_update", {
      entity: "project",
      recordId: project.id,
      revision: 0,
      data: { description: "lost update" },
    });
    assert.equal(stale.isError, true);
    assert.ok(stale.content[0].text.includes("修订号"));
    const wrong = await raw("record_get", {
      entity: "sql",
      projectId: "foreign",
      versionId: version.id,
      recordId: sql.id,
    });
    assert.equal(wrong.isError, true);
    const secretInput = await raw("record_update", {
      ...scope,
      entity: "environment",
      recordId: environment.id,
      revision: app.store.get("environments").revision,
      data: {
        servers: [
          {
            id: "node",
            name: "节点",
            host: "192.0.2.10",
            port: "22",
            authentication: "environment",
            password: "not-a-real-secret",
          },
        ],
      },
    });
    assert.equal(secretInput.isError, true);
    assert.equal(
      secretInput.content[0].text.includes("not-a-real-secret"),
      false,
    );
    const denied = await raw("record_delete", {
      ...scope,
      entity: "service",
      recordId: service.id,
      revision: (await call("records_list", { ...scope, entity: "service" }))
        .revision,
      confirmed: true,
    });
    assert.equal(denied.isError, true);
    const merged = await call("version_merge", {
      projectId: project.id,
      environmentId: environment.id,
      versionIds: [version.id],
    });
    assert.equal(merged.scripts[0].sql, "SELECT 2;");
    assert.equal(merged.configs[0].content, "feature: true");
    assert.deepEqual(merged.serviceScopes[0].serviceIds, [service.id]);
    assert.equal(merged.serviceScopes[0].services[0].name, "api");
    await remove(sqlScope, sql.id);
    await remove(configScope, config.id);
    await remove({ ...scope, entity: "version" }, version.id);
    await remove({ ...scope, entity: "environment" }, environment.id);
    await remove({ ...scope, entity: "service" }, service.id);
    await remove({ entity: "project" }, project.id);
    assert.equal(
      (await call("records_list", { entity: "project" })).records.length,
      0,
    );
    const p2 = await create(
      { entity: "project" },
      { name: "固定版本", key: "fixed" },
    );
    const fixed = await create(
      { entity: "version", projectId: p2.id },
      { name: "20261021-02", status: "就绪" },
    );
    const fixedScope = { entity: "version", projectId: p2.id };
    await update(fixedScope, fixed.id, { status: "草稿" });
    const editable = await update(fixedScope, fixed.id, {
      title: "取消就绪后可继续编辑",
    });
    assert.equal(editable.record.title, "取消就绪后可继续编辑");
    await update(fixedScope, fixed.id, { status: "就绪" });
    const deleteFixed = await raw("record_delete", {
      entity: "version",
      projectId: p2.id,
      recordId: fixed.id,
      revision: app.store.get("releases").revision,
      confirmed: true,
    });
    assert.equal(deleteFixed.isError, true);
    await update({ entity: "version", projectId: p2.id }, fixed.id, {
      status: "已归档",
    });
    assert.equal(
      (
        await call("record_get", {
          entity: "version",
          projectId: p2.id,
          recordId: fixed.id,
        })
      ).record.status,
      "已归档",
    );
  } finally {
    await client.close();
    await app.stop();
    await temp.clean();
  }
});
