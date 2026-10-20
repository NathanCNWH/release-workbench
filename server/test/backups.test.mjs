import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { Store } from "../store.mjs";
import { Backups } from "../backups.mjs";
import { temporary, seed, until } from "./helpers.mjs";

test("independent MySQL backup only succeeds on dump exit success and produces a checksum", async () => {
  const temp = await temporary(),
    store = new Store(temp.path);
  let args, environment;
  try {
    seed(store, "http://127.0.0.1:1");
    store.setSecret("db:e1", "fixture-db-password");
    const backups = new Backups(store, {
      spawnProcess: (_binary, argv, options) => {
        args = argv;
        environment = options.env;
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => {};
        setImmediate(() => {
          child.stdout.end(
            "-- controlled backup fixture\nCREATE TABLE fixture(id INT);",
          );
          child.stderr.end();
          child.emit("close", 0);
        });
        return child;
      },
    });
    const record = backups.mysql("e1");
    assert.equal(record.status, "备份中");
    const complete = await until(() =>
      store
        .list("backups")
        .find((b) => b.id === record.id && b.status === "备份完成"),
    );
    assert.ok(args.includes("--single-transaction"));
    assert.equal(
      args.some((a) => a.includes("fixture-db-password")),
      false,
    );
    assert.equal(environment.MYSQL_PWD, "fixture-db-password");
    assert.ok(
      gunzipSync(await readFile(complete.file))
        .toString()
        .includes("controlled backup fixture"),
    );
    assert.equal(complete.sha256.length, 64);
    assert.equal(store.list("deployments").length, 0);
    await backups.stop();
    const failed = new Backups(store, {
      spawnProcess: () => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => {};
        setImmediate(() => {
          child.stdout.end();
          child.stderr.end();
          const error = new Error("not found");
          error.code = "ENOENT";
          child.emit("error", error);
          child.emit("close", 1);
        });
        return child;
      },
    });
    const unavailable = failed.mysql("e1");
    const failure = await until(() =>
      store
        .list("backups")
        .find((b) => b.id === unavailable.id && b.status === "备份失败"),
    );
    assert.ok(failure.error.includes("mysqldump"));
    assert.throws(() => failed.file(unavailable.id));
    await failed.stop();
  } finally {
    store.close();
    await temp.clean();
  }
});
