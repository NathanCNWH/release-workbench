import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../store.mjs";
import { save, seed, temporary } from "./helpers.mjs";

test("SQLite persists business data and secrets are encrypted and omitted from public state", async () => {
  const temp = await temporary();
  let store = new Store(temp.path);
  try {
    seed(store, "http://127.0.0.1:1");
    store.setSecret("db:e1", "fixture-database-password");
    assert.equal(
      JSON.stringify(store.publicState()).includes("fixture-secret-token"),
      false,
    );
    assert.equal(
      JSON.stringify(store.publicState()).includes("fixture-database-password"),
      false,
    );
    assert.equal(
      store.db
        .prepare("SELECT value FROM secrets WHERE id=?")
        .get("db:e1")
        .value.includes("fixture-database-password"),
      false,
    );
    assert.throws(() => store.save("projects", [], -1), /其他窗口/);
    store.close();
    store = new Store(temp.path);
    assert.equal(store.secret("db:e1"), "fixture-database-password");
    assert.equal(store.get("projects").data[0].services.length, 2);
    assert.equal(store.get("releases").data[0].components.length, 0);
    const versions = store.get("releases").data;
    save(
      store,
      "releases",
      versions.map((r) => ({ ...r, status: "就绪" })),
    );
    assert.throws(
      () =>
        save(
          store,
          "releases",
          versions.map((r) => ({
            ...r,
            status: "就绪",
            title: "illegal edit",
          })),
        ),
      /不能修改资源/,
    );
    assert.throws(
      () =>
        save(
          store,
          "environments",
          store
            .get("environments")
            .data.map((e) => ({
              ...e,
              bindings: [
                ...e.bindings,
                { ...e.bindings[0], serviceId: "outside-project" },
              ],
            })),
        ),
      /不存在的服务/,
    );
  } finally {
    store.close();
    await temp.clean();
  }
});
