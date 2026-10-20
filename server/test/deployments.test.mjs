import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../store.mjs";
import { Deployments, terminal } from "../deployments.mjs";
import { Jenkins } from "../jenkins.mjs";
import { mockJenkins, seed, save, temporary, until } from "./helpers.mjs";

test("restart resumes a known queue without re-triggering; cancelled and rejected jobs keep distinct results", async () => {
  const temp = await temporary(),
    mock = await mockJenkins(),
    store = new Store(temp.path);
  let engine = new Deployments(store, { pollMs: 5000 });
  try {
    seed(store, mock.base);
    const first = engine.run(
      engine.preview({
        projectId: "p1",
        environmentId: "e1",
        selections: [{ serviceId: "s1", branch: "main" }],
      }).id,
    );
    await until(() => store.deployment(first.id).services[0].queueUrl);
    await until(() => !engine.active.size);
    engine.stop();
    engine = new Deployments(store, { pollMs: 20 });
    engine.start();
    await until(() => store.deployment(first.id).status === "成功");
    assert.equal(mock.triggers.length, 1);
    mock.setCancelled(true);
    const second = engine.run(
      engine.preview({
        projectId: "p1",
        environmentId: "e1",
        selections: [{ serviceId: "s1", branch: "test" }],
      }).id,
    );
    await until(() => store.deployment(second.id).status === "已中止");
    mock.setCancelled(false);
    mock.reject(true);
    const third = engine.run(
      engine.preview({
        projectId: "p1",
        environmentId: "e1",
        selections: [{ serviceId: "s1", branch: "test" }],
      }).id,
    );
    await until(() => store.deployment(third.id).status === "失败");
    assert.ok(store.deployment(third.id).services[0].log.includes("HTTP 403"));
    assert.equal(mock.triggers.length, 3);
  } finally {
    engine.stop();
    await until(() => !engine.active.size);
    store.close();
    await mock.close();
    await temp.clean();
  }
});

test("selected services, branch parameters, idempotency, version association and partial failure", async () => {
  const temp = await temporary(),
    mock = await mockJenkins({ failWeb: true }),
    store = new Store(temp.path),
    engine = new Deployments(store, { pollMs: 20 });
  try {
    seed(store, mock.base);
    engine.start();
    for (const selections of [[null], [{ serviceId: "s1", branch: 42 }]]) {
      assert.throws(
        () =>
          engine.preview({ projectId: "p1", environmentId: "e1", selections }),
        /请选择/,
      );
    }
    const preview = engine.preview({
      projectId: "p1",
      environmentId: "e1",
      versionId: "v1",
      selections: [{ serviceId: "s1", branch: "test" }, { serviceId: "s2" }],
    });
    const record = engine.run(preview.id);
    assert.notEqual(record.status, "成功");
    assert.equal(engine.run(preview.id).id, record.id);
    const complete = await until(() => {
      const result = store.deployment(record.id);
      return terminal(result.status) && result;
    });
    assert.equal(complete.status, "部分失败");
    assert.equal(complete.versionId, "v1");
    assert.equal(mock.triggers.length, 2);
    assert.equal(
      new URLSearchParams(mock.triggers[0].body).get("git_branch"),
      "test",
    );
    assert.equal(
      new URLSearchParams(mock.triggers[1].body).has("git_branch"),
      false,
    );
    assert.equal(
      complete.services[0].log.includes("fixture-secret-token"),
      false,
    );
    const client = new Jenkins(
      { url: mock.base, username: "fixture-user" },
      "fixture-secret-token",
    );
    assert.equal(
      (await client.metadata("folder/api")).parameters[0].name,
      "git_branch",
    );
    assert.throws(
      () => client.safeUrl("http://example.org/queue/item/1/"),
      /站点范围之外/,
    );
    assert.throws(
      () =>
        engine.preview({
          projectId: "p1",
          environmentId: "e1",
          selections: [{ serviceId: "s1", branch: "outside" }],
        }),
      /分支/,
    );
    const stale = engine.preview({
      projectId: "p1",
      environmentId: "e1",
      selections: [{ serviceId: "s1", branch: "main" }],
    });
    save(
      store,
      "environments",
      store.get("environments").data.map((e) => ({
        ...e,
        bindings: e.bindings.map((b) => ({
          ...b,
          parameters: "ENV=changed",
        })),
      })),
    );
    assert.throws(() => engine.run(stale.id), /重新预览/);
  } finally {
    engine.stop();
    await until(() => !engine.active.size);
    store.close();
    await mock.close();
    await temp.clean();
  }
});

test("ambiguous POST is never retried, and restart distinguishes interrupted submissions", async () => {
  const temp = await temporary(),
    mock = await mockJenkins(),
    store = new Store(temp.path),
    engine = new Deployments(store, { pollMs: 20 });
  try {
    seed(store, mock.base);
    mock.unknown(true);
    engine.start();
    const record = engine.run(
      engine.preview({
        projectId: "p1",
        environmentId: "e1",
        selections: [{ serviceId: "s1", branch: "main" }],
      }).id,
    );
    await until(() => store.deployment(record.id).status === "结果未知");
    await engine.tick();
    assert.equal(mock.triggers.length, 1);
    const existing = store.deployment(record.id);
    existing.status = "排队中";
    existing.services[0].status = "提交中";
    store.record("deployments", existing.id, existing);
    engine.stop();
    const restarted = new Deployments(store);
    restarted.start();
    assert.equal(store.deployment(existing.id).status, "结果未知");
    restarted.stop();
  } finally {
    engine.stop();
    await until(() => !engine.active.size);
    store.close();
    await mock.close();
    await temp.clean();
  }
});
