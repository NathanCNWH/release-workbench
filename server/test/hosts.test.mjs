import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import ssh2 from "ssh2";
const { Server } = ssh2;
import { Store } from "../store.mjs";
import { checkSsh } from "../connections.mjs";
import { temporary, seed, save } from "./helpers.mjs";

test("service-specific hosts persist, legacy hosts remain unassigned, and environment SSH login needs no username", async () => {
  const temp = await temporary();
  let store = new Store(temp.path),
    ssh;
  const oldName = process.env.SSH_NAME,
    oldPassword = process.env.SSH_PWD;
  try {
    seed(store, "http://127.0.0.1:1");
    let e = store.get("environments").data[0];
    const legacy = {
      ...e,
      bindings: e.bindings.map(({ serverIds, ...binding }) => binding),
    };
    store.save("environments", [legacy], store.get("environments").revision);
    store.close();
    store = new Store(temp.path);
    e = store.get("environments").data[0];
    assert.equal(e.servers.length, 1);
    assert.deepEqual(e.bindings[0].serverIds, []);
    save(store, "environments", [{ ...e, servers: [], bindings: [] }]);
    const hostKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    let login;
    ssh = new Server({ hostKeys: [hostKey] }, (client) => {
      client.on("error", () => {});
      client.on("authentication", (ctx) => {
        login = ctx.username;
        if (
          ctx.method === "password" &&
          ctx.username === "fixture-env-user" &&
          ctx.password === "fixture-env-password"
        )
          ctx.accept();
        else ctx.reject();
      });
    });
    await new Promise((resolve) => ssh.listen(0, "127.0.0.1", resolve));
    const host = {
      id: "host1",
      name: "node",
      host: "127.0.0.1",
      port: String(ssh.address().port),
      username: "",
      authentication: "environment",
    };
    save(store, "environments", [
      {
        ...e,
        servers: [host, { ...host, id: "host2" }],
        bindings: e.bindings.map((b, index) => ({
          ...b,
          serverIds: index ? ["host2"] : ["host1", "host2"],
        })),
      },
    ]);
    assert.throws(
      () =>
        save(store, "environments", [
          {
            ...e,
            servers: [host],
            bindings: [{ ...e.bindings[0], serverIds: ["wrong-env-host"] }],
          },
        ]),
      /不属于当前环境/,
    );
    assert.throws(
      () =>
        save(store, "environments", [
          { ...e, servers: [{ ...host, authentication: "password" }] },
        ]),
      /登录账号/,
    );
    process.env.SSH_NAME = "fixture-env-user";
    process.env.SSH_PWD = "fixture-env-password";
    const checked = await checkSsh(
      store,
      store.get("environments").data[0],
      "host1",
    );
    assert.equal(checked.ok, true);
    assert.equal(login, "fixture-env-user");
    assert.ok(checked.fingerprint);
    store.close();
    store = new Store(temp.path);
    assert.deepEqual(
      store.get("environments").data[0].bindings.map((b) => b.serverIds),
      [["host1", "host2"], ["host2"]],
    );
  } finally {
    if (oldName === undefined) delete process.env.SSH_NAME;
    else process.env.SSH_NAME = oldName;
    if (oldPassword === undefined) delete process.env.SSH_PWD;
    else process.env.SSH_PWD = oldPassword;
    if (ssh) await new Promise((resolve) => ssh.close(resolve));
    store.close();
    await temp.clean();
  }
});
