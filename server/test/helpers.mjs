import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import http from "node:http";
import { validateCollection } from "../validation.mjs";
export async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "release-workbench-test-"));
  return {
    path,
    clean: () => {
      if (
        !resolve(path).startsWith(
          `${resolve(tmpdir())}${sep}release-workbench-test-`,
        )
      )
        throw new Error("Refusing cleanup outside test directory");
      return rm(path, { recursive: true, force: true });
    },
  };
}
export function save(store, key, data) {
  const old = store.get(key);
  return store.save(key, validateCollection(store, key, data), old.revision);
}
export function seed(store, base) {
  save(store, "projects", [
    {
      id: "p1",
      name: "受控测试项目",
      key: "local-test",
      description: "",
      color: "green",
      updated: "",
      services: [
        {
          id: "s1",
          name: "api",
          kind: "后端服务",
          repository: "https://git.example.com/testing.git",
          defaultBranch: "main",
        },
        {
          id: "s2",
          name: "web",
          kind: "前端应用",
          repository: "https://git.example.com/web.git",
          defaultBranch: "main",
        },
      ],
    },
  ]);
  save(store, "environments", [
    {
      id: "e1",
      projectId: "p1",
      name: "测试环境",
      key: "test",
      type: "测试",
      servers: [
        {
          id: "host1",
          name: "节点 1",
          host: "192.0.2.10",
          port: "22",
          username: "tester",
          authentication: "password",
        },
      ],
      bindings: [
        {
          serviceId: "s1",
          job: "folder/api",
          supportsBranch: true,
          branchParameter: "git_branch",
          branches: ["main", "test"],
          defaultBranch: "main",
          parameters: "ENV=test",
        },
        {
          serviceId: "s2",
          job: "folder/web",
          supportsBranch: false,
          branchParameter: "",
          branches: [],
          defaultBranch: "",
          parameters: "",
        },
      ],
      deployPath: "/opt/test",
      backupPath: "",
      dbHost: "192.0.2.11",
      dbPort: "3306",
      database: "test",
      dbUser: "tester",
      configPath: "",
      checkedAt: "",
    },
  ]);
  save(store, "releases", [
    {
      id: "v1",
      projectId: "p1",
      name: "20261020-01",
      title: "测试版本",
      status: "草稿",
      created: new Date().toISOString(),
      author: "测试",
      scripts: [],
      configs: [],
      components: [],
    },
  ]);
  save(
    store,
    "jenkinsProfiles",
    store
      .get("jenkinsProfiles")
      .data.map((p) => ({ ...p, url: base, username: "fixture-user" })),
  );
  store.setSecret("jenkins:backend", "fixture-secret-token");
  store.setSecret("jenkins:frontend", "fixture-secret-token");
}
export async function mockJenkins({ failWeb = false } = {}) {
  let triggers = [],
    base = "",
    cancelled = false,
    rejectBuild = false,
    unknownQueue = false,
    logsFail = false;
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    const send = (data) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (path === "/api/json") return send({ nodeName: "fixture" });
    if (req.method === "POST" && /\/build(WithParameters)?$/.test(path)) {
      let body = "";
      for await (const chunk of req) body += chunk;
      triggers.push({ path, body, authorization: req.headers.authorization });
      if (rejectBuild) {
        res.writeHead(403);
        return res.end();
      }
      res.writeHead(
        201,
        unknownQueue ? {} : { Location: `/queue/item/${triggers.length}/` },
      );
      return res.end();
    }
    if (path === "/crumbIssuer/api/json") {
      res.writeHead(404);
      return res.end();
    }
    if (/\/queue\/item\/\d+\/api\/json$/.test(path)) {
      const index = +path.split("/")[3],
        target =
          triggers[index - 1]?.path.replace(/build(WithParameters)?$/, "") ||
          "/job/folder/job/api/";
      return send(
        cancelled
          ? { cancelled: true }
          : { executable: { url: `${base}${target}${index}/`, number: index } },
      );
    }
    if (/\/\d+\/api\/json$/.test(path))
      return send({
        building: false,
        result: failWeb && path.includes("/web/") ? "FAILURE" : "SUCCESS",
        duration: 10,
      });
    if (path.endsWith("/logText/progressiveText")) {
      res.writeHead(logsFail ? 403 : 200);
      return res.end("fixture-secret-token\nFinished build\n");
    }
    if (path.endsWith("/api/json"))
      return send({
        name: "fixture",
        buildable: true,
        property: [
          {
            parameterDefinitions: [
              {
                name: "git_branch",
                type: "ChoiceParameterDefinition",
                choices: ["main", "test"],
                defaultParameterValue: { value: "main" },
              },
            ],
          },
        ],
      });
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    triggers,
    setCancelled: (value) => (cancelled = value),
    reject: (value) => (rejectBuild = value),
    unknown: (value) => (unknownQueue = value),
    logsFail: (value) => (logsFail = value),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
export async function until(check, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("受控检查超时");
}
