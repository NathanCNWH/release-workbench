import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../store.mjs";
import { Deployments } from "../deployments.mjs";
import { mergeVersions } from "../versions.mjs";
import { temporary, seed, save } from "./helpers.mjs";

test("version service scope rejects foreign and duplicate references, protects fixed versions and does not select deployment services", async () => {
  const temp = await temporary(),
    store = new Store(temp.path);
  try {
    seed(store, "http://127.0.0.1:1");
    const project = store.get("projects").data[0];
    save(store, "projects", [
      project,
      {
        ...project,
        id: "p2",
        key: "foreign",
        services: [{ ...project.services[0], id: "foreign-service" }],
      },
    ]);
    const version = store.get("releases").data[0];
    assert.throws(
      () => save(store, "releases", [{ ...version, serviceIds: ["s1", "s1"] }]),
      /不能重复/,
    );
    assert.throws(
      () =>
        save(store, "releases", [
          { ...version, serviceIds: ["foreign-service"] },
        ]),
      /不属于当前项目/,
    );
    save(store, "releases", [{ ...version, serviceIds: ["s1"] }]);
    const engine = new Deployments(store);
    const plan = engine.preview({
      projectId: "p1",
      environmentId: "e1",
      versionIds: ["v1"],
      selections: [{ serviceId: "s2" }],
    });
    assert.deepEqual(
      plan.services.map((s) => s.serviceId),
      ["s2"],
    );
    assert.deepEqual(plan.versionSnapshot.serviceScopes[0].serviceIds, ["s1"]);
    assert.equal(plan.versionSnapshot.serviceScopes[0].services[0].name, "api");
    assert.equal(store.list("deployments").length, 0);
    save(store, "releases", [{ ...version, serviceIds: [] }]);
    assert.throws(() => engine.run(plan.id), /重新预览/);
    assert.deepEqual(plan.versionSnapshot.serviceScopes[0].serviceIds, ["s1"]);
    save(store, "releases", [
      { ...version, serviceIds: ["s1"], status: "就绪" },
    ]);
    assert.throws(
      () =>
        save(store, "releases", [
          { ...version, serviceIds: ["s2"], status: "就绪" },
        ]),
      /不能修改资源/,
    );
    save(store, "environments", []);
    assert.throws(
      () =>
        save(store, "projects", [
          { ...project, services: [project.services[1]] },
          store.get("projects").data[1],
        ]),
      /版本引用/,
    );
  } finally {
    store.close();
    await temp.clean();
  }
});

test("legacy fixed versions migrate to empty scope and archive; manually ordered project services persist across restart", async () => {
  const temp = await temporary();
  let store = new Store(temp.path);
  try {
    seed(store, "http://127.0.0.1:1");
    const legacy = { ...store.get("releases").data[0], status: "就绪" };
    delete legacy.serviceIds;
    store.save("releases", [legacy], store.get("releases").revision);
    save(
      store,
      "projects",
      store
        .get("projects")
        .data.map((p) => ({ ...p, services: [...p.services].reverse() })),
    );
    store.close();
    store = new Store(temp.path);
    assert.deepEqual(
      store.get("projects").data[0].services.map((s) => s.id),
      ["s2", "s1"],
    );
    const migrated = store.get("releases").data[0];
    assert.deepEqual(migrated.serviceIds, []);
    save(store, "releases", [{ ...migrated, status: "已归档" }]);
    assert.deepEqual(
      mergeVersions(store, { projectId: "p1", versionIds: ["v1"] })
        .serviceScopes[0].services,
      [],
    );
  } finally {
    store.close();
    await temp.clean();
  }
});
