import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../index.mjs";
import { Store } from "../store.mjs";
import { seed, save, temporary } from "./helpers.mjs";

test("project notes persist through API edits, protect ownership and revisions, and join workspace exports", async () => {
  const temp = await temporary();
  const app = await createApp({
    directory: temp.path,
    port: 0,
    serveFiles: false,
  });
  const base = `http://127.0.0.1:${app.port}`;
  const headers = {
    Origin: base,
    "Content-Type": "application/json",
    "X-Workbench-Client": "local",
  };
  const put = (name, data, revision) =>
    fetch(`${base}/api/state/${name}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ data, revision }),
    });
  const getNotes = async () =>
    (await (await fetch(`${base}/api/state`)).json()).projectNotes;
  try {
    seed(app.store, "http://127.0.0.1:1");
    save(app.store, "projects", [
      ...app.store.get("projects").data,
      {
        id: "p2",
        name: "第二项目",
        key: "second",
        description: "",
        color: "green",
        updated: "",
        services: [],
      },
    ]);
    const content =
      "# 项目说明\r\n\r\n- 中文笔记\n\n```sh\necho example\n```\n<script>alert('example')</script>";
    const a = {
      id: "note-a",
      projectId: "p1",
      title: " 第一篇 ",
      content,
      createdAt: "2000-01-01T00:00:00.000Z",
    };
    const b = {
      id: "note-b",
      projectId: "p1",
      title: "第二篇",
      content: "普通文本",
    };
    const c = {
      id: "note-c",
      projectId: "p2",
      title: "独立项目笔记",
      content: "独立正文",
    };
    assert.deepEqual(await getNotes(), { data: [], revision: 0 });
    assert.equal((await put("projectNotes", [a], undefined)).status, 409);
    assert.equal(
      (await put("projectNotes", [{ ...a, projectId: "missing" }], 0)).status,
      400,
    );
    assert.equal((await put("projectNotes", [a, a], 0)).status, 400);
    assert.equal(
      (await put("projectNotes", [{ ...a, title: " " }], 0)).status,
      400,
    );
    assert.equal((await put("projectNotes", [a, b, c], 0)).status, 200);
    const first = await getNotes();
    assert.equal(first.data.length, 3);
    assert.equal(first.data[0].title, "第一篇");
    assert.equal(first.data[0].content, content);
    assert.notEqual(first.data[0].createdAt, a.createdAt);
    assert.equal((await put("projectNotes", [], 0)).status, 409);
    assert.equal(
      (
        await put(
          "projectNotes",
          first.data.map((n) =>
            n.id === a.id ? { ...n, projectId: "p2" } : n,
          ),
          first.revision,
        )
      ).status,
      400,
    );
    const projects = app.store.get("projects");
    assert.equal(
      (
        await put(
          "projects",
          projects.data.filter((p) => p.id !== "p2"),
          projects.revision,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await put(
          "projectNotes",
          first.data.map((n) =>
            n.id === a.id
              ? {
                  ...n,
                  title: "已修改",
                  content: "新正文",
                  createdAt: a.createdAt,
                }
              : n,
          ),
          first.revision,
        )
      ).status,
      200,
    );
    const edited = await getNotes();
    assert.equal(edited.data[0].createdAt, first.data[0].createdAt);
    assert.equal(edited.data[0].content, "新正文");
    assert.deepEqual(edited.data[2], first.data[2]);
    const exportedRecord = await (
      await fetch(`${base}/api/backups/workspace`, {
        method: "POST",
        headers,
        body: "{}",
      })
    ).json();
    const exportedText = await (
      await fetch(`${base}/api/backups/${exportedRecord.id}/download`)
    ).text();
    assert.deepEqual(
      JSON.parse(exportedText).collections.projectNotes,
      edited.data,
    );
    assert.equal(exportedText.includes("fixture-secret-token"), false);
    assert.equal(
      (
        await put(
          "projectNotes",
          edited.data.filter((n) => n.id !== b.id),
          edited.revision,
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await getNotes()).data.map((n) => n.id),
      [a.id, c.id],
    );
    assert.equal(app.store.list("deployments").length, 0);
  } finally {
    await app.stop();
    await temp.clean();
  }
});

test("legacy workspaces gain empty notes without changing existing collections or encryption keys; notes survive restart", async () => {
  const temp = await temporary();
  let store = new Store(temp.path);
  try {
    seed(store, "http://127.0.0.1:1");
    store.db.prepare("DELETE FROM collections WHERE name='projectNotes'").run();
    const original = store.db
      .prepare("SELECT * FROM collections ORDER BY name")
      .all();
    const key = await readFile(resolve(temp.path, ".master-key"));
    store.close();
    store = new Store(temp.path);
    assert.deepEqual(store.get("projectNotes"), { data: [], revision: 0 });
    assert.deepEqual(
      store.db
        .prepare(
          "SELECT * FROM collections WHERE name!='projectNotes' ORDER BY name",
        )
        .all(),
      original,
    );
    assert.deepEqual(await readFile(resolve(temp.path, ".master-key")), key);
    assert.equal(store.secret("jenkins:backend"), "fixture-secret-token");
    save(store, "projectNotes", [
      {
        id: "restart-note",
        projectId: "p1",
        title: "重启保留",
        content: "# 保留原文\n\n  空格和换行\n",
      },
    ]);
    const saved = store.get("projectNotes");
    store.close();
    store = new Store(temp.path);
    assert.deepEqual(store.get("projectNotes"), saved);
  } finally {
    store.close();
    await temp.clean();
  }
});
