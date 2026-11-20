import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../store.mjs";
import { recordOperation } from "../records.mjs";
import { Deployments } from "../deployments.mjs";
import { temporary, seed, save, mockJenkins, until } from "./helpers.mjs";

test("locked versions can return to draft and published snapshots stay intact", async () => {
  const temp = await temporary(),
    mock = await mockJenkins(),
    store = new Store(temp.path),
    engine = new Deployments(store, { pollMs: 20 });
  try {
    seed(store, mock.base);
    save(
      store,
      "releases",
      store
        .get("releases")
        .data.map((v) => ({
          ...v,
          status: "就绪",
          serviceIds: ["s1"],
          scripts: [
            {
              id: "sql1",
              name: "001.sql",
              database: "test",
              order: 1,
              kind: "新增",
              description: "",
              sql: "SELECT 1;",
              previousSql: "",
            },
          ],
          configs: [
            {
              id: "cfg1",
              name: "app.yml",
              path: "/opt/config/app.yml",
              format: "YAML",
              content: "feature: false",
              previousContent: "",
            },
          ],
        })),
    );
    const update = (data) =>
      recordOperation(store, "update", {
        entity: "version",
        projectId: "p1",
        recordId: "v1",
        revision: store.get("releases").revision,
        data,
      });
    const input = {
      projectId: "p1",
      environmentId: "e1",
      versionIds: ["v1"],
      selections: [{ serviceId: "s1" }],
    };
    engine.start();
    const deployed = engine.run(engine.preview(input).id);
    await until(() => store.deployment(deployed.id).status === "成功");
    assert.equal(store.get("releases").data[0].status, "已发布");
    const snapshot = JSON.stringify(
      store.deployment(deployed.id).versionSnapshot,
    );
    assert.throws(
      () => update({ status: "草稿", serviceIds: ["s2"] }),
      /不能.*修改资源/,
    );
    assert.equal(store.get("releases").data[0].status, "已发布");
    assert.equal(update({ status: "就绪" }).record.status, "就绪");
    const manuallyUpdated = store.get("releases");
    await engine.refresh(deployed.id);
    assert.deepEqual(store.get("releases"), manuallyUpdated);
    const stalePlan = engine.preview(input);
    assert.equal(update({ status: "草稿" }).record.status, "草稿");
    assert.throws(() => engine.run(stalePlan.id), /重新预览/);
    update({ serviceIds: ["s2"], title: "重新编辑的版本" });
    for (const [entity, recordId, data] of [
      ["sql", "sql1", { sql: "SELECT 2;" }],
      ["config", "cfg1", { content: "feature: true" }],
    ])
      recordOperation(store, "update", {
        entity,
        projectId: "p1",
        versionId: "v1",
        recordId,
        revision: store.get("releases").revision,
        data,
      });
    const changed = store.get("releases").data[0];
    assert.equal(changed.id, "v1");
    assert.equal(changed.scripts[0].sql, "SELECT 2;");
    assert.equal(changed.configs[0].content, "feature: true");
    assert.deepEqual(changed.serviceIds, ["s2"]);
    assert.equal(
      JSON.stringify(store.deployment(deployed.id).versionSnapshot),
      snapshot,
    );
    assert.equal(mock.triggers.length, 1);
    update({ status: "就绪" });
    assert.equal(update({ status: "已归档" }).record.status, "已归档");
    assert.equal(update({ status: "草稿" }).record.status, "草稿");
  } finally {
    engine.stop();
    await until(() => !engine.active.size);
    store.close();
    await mock.close();
    await temp.clean();
  }
});
