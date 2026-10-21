import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../store.mjs";
import { Deployments } from "../deployments.mjs";
import { mergeVersions } from "../versions.mjs";
import { temporary, seed, save, mockJenkins, until } from "./helpers.mjs";

const sql = (id, name, content, order = 1) => ({
  id,
  name,
  database: "test",
  order,
  kind: "新增",
  description: "",
  sql: content,
  previousSql: "",
});
const config = (id, content) => ({
  id,
  name: "application.yml",
  path: "${CONFIG_PATH}/application.yml",
  format: "YAML",
  content,
  previousContent: "",
});
test("configuration whitespace changes remain conflicts", async () => {
  const temp = await temporary(),
    store = new Store(temp.path);
  try {
    seed(store, "http://127.0.0.1:1");
    const first = store.get("releases").data[0];
    save(store, "releases", [
      { ...first, configs: [config("c1", "value: |\n  content\n")] },
      {
        ...first,
        id: "v2",
        name: "second",
        configs: [config("c2", "value: |\n  content\n\n")],
      },
    ]);
    assert.equal(
      mergeVersions(store, { projectId: "p1", versionIds: ["v1", "v2"] })
        .unresolved,
      1,
    );
  } finally {
    store.close();
    await temp.clean();
  }
});
test("multi-version merge resolves conflicts, deduplicates SQL and freezes sources without changing originals", async () => {
  const temp = await temporary(),
    mock = await mockJenkins(),
    store = new Store(temp.path),
    engine = new Deployments(store, { pollMs: 20 });
  try {
    seed(store, mock.base);
    const first = store.get("releases").data[0];
    save(store, "releases", [
      {
        ...first,
        scripts: [
          sql("a", "001.sql", "SELECT 1;"),
          sql("b", "change.sql", "SELECT 2;", 2),
        ],
        configs: [config("c", "feature: false")],
      },
      {
        ...first,
        id: "v2",
        name: "20261021-02",
        scripts: [
          sql("d", "copy.sql", "SELECT 1;\r\n"),
          sql("e", "change.sql", "SELECT 3;", 2),
        ],
        configs: [config("f", "feature: true")],
      },
    ]);
    const before = store.get("releases").data;
    const input = {
      projectId: "p1",
      environmentId: "e1",
      versionIds: ["v1", "v2"],
      selections: [{ serviceId: "s1", branch: "main" }],
    };
    const unresolved = mergeVersions(store, input);
    assert.equal(unresolved.unresolved, 2);
    assert.equal(unresolved.scripts.length, 1);
    assert.equal(unresolved.scripts[0].origins.length, 2);
    assert.throws(() => engine.preview(input), /未处理冲突/);
    const resolutions = Object.fromEntries(
      unresolved.conflicts.map((conflict) => [
        conflict.key,
        conflict.choices[1].id,
      ]),
    );
    const merged = mergeVersions(store, { ...input, resolutions });
    assert.equal(merged.unresolved, 0);
    assert.deepEqual(
      merged.scripts.map((s) => s.sql),
      ["SELECT 1;", "SELECT 3;"],
    );
    assert.equal(merged.configs[0].content, "feature: true");
    assert.deepEqual(
      mergeVersions(store, { ...input, versionIds: ["v2", "v1"] }).versions.map(
        (v) => v.id,
      ),
      ["v2", "v1"],
    );
    assert.deepEqual(store.get("releases").data, before);
    assert.throws(
      () => mergeVersions(store, { ...input, versionIds: ["outside"] }),
      /当前项目/,
    );
    assert.throws(
      () => mergeVersions(store, { ...input, versionIds: ["v1", "v1"] }),
      /不重复/,
    );
    const plan = engine.preview({ ...input, resolutions });
    save(
      store,
      "releases",
      before.map((v) => (v.id === "v1" ? { ...v, title: "新说明" } : v)),
    );
    assert.throws(() => engine.run(plan.id), /重新预览/);
    engine.start();
    const finalPlan = engine.preview({ ...input, resolutions });
    const record = engine.run(finalPlan.id);
    await until(() => store.deployment(record.id).status === "成功");
    const saved = store.deployment(record.id);
    assert.deepEqual(saved.versionIds, ["v1", "v2"]);
    assert.equal(saved.versionSnapshot.configs[0].content, "feature: true");
    save(
      store,
      "releases",
      store.get("releases").data.map((v) => ({ ...v, title: "后续修改" })),
    );
    assert.equal(
      store.deployment(record.id).versionSnapshot.versions[0].title,
      "新说明",
    );
    assert.equal(mock.triggers.length, 1);
    assert.throws(() => save(store, "releases", []), /历史引用/);
  } finally {
    engine.stop();
    await until(() => !engine.active.size);
    store.close();
    await mock.close();
    await temp.clean();
  }
});
