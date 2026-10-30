"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), fsp = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { NodeManager } = require("../plugin/service/core/lib/koinos/node-manager");
const { createProfileMigration, MARKER } = require("../plugin/service/core/lib/koinos/profile-migration");
const { assertRestoreReady } = require("../plugin/service/core/lib/koinos/node-maintenance");
const { NETWORKS } = require("../plugin/service/core/lib/koinos/constants");
const ok = stdout => ({ ok: true, stdout: stdout || "", stderr: "" });
function fixture(t, options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kai-chain-migration-"))), source = path.join(root, "old", "mainnet"), dataRoot = path.join(root, "plugin", "node"), target = path.join(dataRoot, "mainnet"), basedir = path.join(source, "basedir");
  const templateRoot = path.resolve(__dirname, "../plugin/service/core/koinos-node-template");
  const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
  write(path.join(source, "config/genesis_data.json"), fs.readFileSync(path.join(templateRoot, "mainnet/genesis_data.json")));
  write(path.join(source, "config/config.yml"), "producer: existing-wallet\n"); write(path.join(source, ".env"), "OLD_CONFIG=kept\n");
  write(path.join(basedir, "chain/0001.sst"), Buffer.alloc(options.bytes || 128, 1)); write(path.join(basedir, "chain/CURRENT"), "MANIFEST-0001"); write(path.join(basedir, "block_store/blocks.sst"), Buffer.alloc(256, 2));
  write(path.join(basedir, "block_producer/private.key"), "private producer key remains old"); write(path.join(root, "old/wallet/wallet.json"), "original encrypted wallet remains old");
  let rows = ["chain", "block_store"].map((service, index) => ({ id: String(index + 1).repeat(64), project: NETWORKS.mainnet.composeProject, root: source, service, image: "koinos/koinos-" + service.replaceAll("_", "-") + ":latest", running: true, paused: false, mounts: [{ Type: "bind", Source: basedir, Destination: "/koinos", RW: true }] }));
  const calls = []; let claimed = false, afterExec;
  const exec = async (bin, args) => {
    calls.push(args); if (afterExec) await afterExec(args);
    if (args[0] === "context") return ok(JSON.stringify(options.endpoint || "unix:///var/run/docker.sock"));
    if (args[0] === "ps") return ok(rows.map(row => row.id.slice(0, 12)).join("\n"));
    if (args[0] === "inspect") return ok(rows.map(row => JSON.stringify(row)).join("\n"));
    if (args[0] === "update") return options.failUpdate ? { ok: false, stdout: "" } : ok();
    if (args[0] === "stop") { if (!options.refuseStop) rows.forEach(row => { row.running = false; }); return ok(); }
    if (args[0] === "rm") { rows = rows.filter(row => !args.includes(row.id)); return ok(); }
    throw Error("Unexpected Docker command " + args.join(" "));
  };
  const manager = new NodeManager({ templateRoot, dataRoot, autoRecover: false, lockRoot: path.join(root, "locks") });
  const make = () => createProfileMigration({ manager }, { exec, claim: () => { if (options.locked) throw Error("Another KAI app is managing this node"); assert.equal(claimed, false); claimed = true; return () => { claimed = false; }; } });
  const service = make();
  t.after(async () => { await service.dispose(); manager.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, source, basedir, target, dataRoot, manager, service, make, calls, write, rows: () => rows, setRows(value) { rows = value; }, onExec(value) { afterExec = value; }, get claimed() { return claimed; } };
}
async function finish(service) { const deadline = Date.now() + 10000; while (service.running && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(service.running, false); return service.status("mainnet"); }
async function begin(f) { const preview = await f.service.preview("mainnet"); f.service.start("mainnet", preview.previewId); return finish(f.service); }

test("reviewed migration retires only the old stack and moves chain state without wallet or producer keys", async t => {
  const f = fixture(t), before = fs.statSync(path.join(f.basedir, "chain/0001.sst"));
  const preview = await f.service.preview("mainnet"); assert.equal(preview.files, 3); assert.equal(preview.available, true); assert.equal(preview.mode, "move"); assert.equal(preview.containers, undefined); assert.match(preview.walletNotice, /KOIN and VHP/);
  assert.equal(f.calls.some(args => ["update", "stop", "rm"].includes(args[0])), false);
  f.service.start("mainnet", preview.previewId); const state = await finish(f.service);
  assert.equal(state.phase, "complete", state.error); assert.equal(state.result.movedFiles, 3); assert.equal(state.result.deletedFiles, 3); assert.equal(f.claimed, false);
  const file = path.join(f.target, "basedir/chain/0001.sst"), after = fs.statSync(file); assert.equal(after.ino, before.ino); assert.equal(after.nlink, 1); assert.deepEqual(fs.readFileSync(file), Buffer.alloc(128, 1));
  assert.equal(fs.existsSync(path.join(f.basedir, "chain")), false); assert.equal(fs.existsSync(path.join(f.target, "basedir/block_producer/private.key")), false);
  assert.equal(fs.readFileSync(path.join(f.basedir, "block_producer/private.key"), "utf8"), "private producer key remains old");
  assert.equal(fs.readFileSync(path.join(f.root, "old/wallet/wallet.json"), "utf8"), "original encrypted wallet remains old");
  assert.equal(fs.readFileSync(path.join(f.source, ".env"), "utf8"), "OLD_CONFIG=kept\n");
  assert.throws(() => assertRestoreReady(f.basedir), /interrupted/); assert.doesNotThrow(() => assertRestoreReady(path.join(f.target, "basedir")));
  assert.equal(f.manager._desiredRunning, false); assert.equal(f.manager._intent.mainnet.producerAddress, null);
  assert.deepEqual(f.calls.filter(args => ["update", "stop", "rm"].includes(args[0])).map(args => args[0]), ["update", "stop", "rm"]);
  assert.ok(!f.calls.some(args => args.includes("--volumes") || args.includes("-f") || args.includes("up")));
});

test("a live old-app lock refuses container changes and source deletion", async t => {
  const f = fixture(t, { locked: true }), state = await begin(f); assert.equal(state.phase, "failed"); assert.match(state.error, /Another KAI app/); assert.equal(state.resumable, false);
  assert.ok(!f.calls.some(args => ["update", "stop", "rm"].includes(args[0]))); assert.ok(fs.existsSync(path.join(f.basedir, "chain/0001.sst")));
});

test("remote Docker contexts, mismatched genesis, unrelated writers, and occupied destinations are refused", async t => {
  for (const kind of ["remote", "genesis", "writer", "occupied"]) await t.test(kind, async t => {
    const f = fixture(t, kind === "remote" ? { endpoint: "ssh://remote.example" } : {});
    if (kind === "genesis") f.write(path.join(f.source, "config/genesis_data.json"), "wrong network");
    if (kind === "writer") f.setRows([...f.rows(), { id: "f".repeat(64), project: "unrelated", running: false, mounts: [{ Type: "bind", Source: path.dirname(f.basedir), Destination: "/data", RW: true }] }]);
    if (kind === "occupied") f.write(path.join(f.target, "basedir/chain/existing"), "keep");
    await assert.rejects(f.service.preview("mainnet"), /local Docker|network|Another Docker|already has chain/);
    assert.ok(!f.calls.some(args => ["update", "stop", "rm"].includes(args[0]))); assert.ok(fs.existsSync(path.join(f.basedir, "chain/0001.sst")));
  });
});

test("stale reviewed containers and unclean shutdown cannot begin transfer", async t => {
  const f = fixture(t), preview = await f.service.preview("mainnet"); f.rows()[0].id = "a".repeat(64); f.service.start("mainnet", preview.previewId); const state = await finish(f.service); assert.equal(state.phase, "failed"); assert.match(state.error, /changed since review/); assert.ok(fs.existsSync(path.join(f.basedir, "chain/0001.sst")));
  const g = fixture(t, { refuseStop: true }), stopped = await begin(g); assert.equal(stopped.phase, "failed"); assert.match(stopped.error, /still running/); assert.ok(!g.calls.some(args => args[0] === "rm"));
});

test("linked source files and directories are never transferred", async t => {
  const f = fixture(t); fs.linkSync(path.join(f.basedir, "chain/0001.sst"), path.join(f.basedir, "chain/linked.sst"));
  await assert.rejects(f.service.preview("mainnet"), /linked or special/); assert.ok(fs.existsSync(path.join(f.basedir, "chain/0001.sst")));
});

test("cross-device copy verifies each destination and deletes each original after publication", async t => {
  const f = fixture(t), original = fsp.link;
  fsp.link = async (source, target) => { if (source.startsWith(f.basedir)) throw Object.assign(Error("different filesystem"), { code: "EXDEV" }); return original(source, target); };
  t.after(() => { fsp.link = original; });
  const before = fs.statSync(path.join(f.basedir, "chain/0001.sst")), state = await begin(f); assert.equal(state.phase, "complete", state.error);
  const after = fs.statSync(path.join(f.target, "basedir/chain/0001.sst")); assert.notEqual(after.ino, before.ino); assert.equal(after.nlink, 1); assert.equal(fs.existsSync(path.join(f.basedir, "chain")), false);
});

test("pause retains completed files and durable markers, then another service instance resumes", async t => {
  const f = fixture(t); let paused = false;
  f.onExec(args => { if (!paused && args[0] === "ps" && f.service.status("mainnet").progress.completedFiles > 0) { paused = true; f.service.cancel(); } });
  let state = await begin(f); assert.equal(state.phase, "cancelled", state.error); assert.equal(state.resumable, true); assert.ok(state.progress.completedFiles > 0); assert.ok(state.progress.completedFiles < 3);
  assert.throws(() => assertRestoreReady(f.basedir)); assert.throws(() => assertRestoreReady(path.join(f.target, "basedir")));
  f.onExec(null); const resumed = f.make(); t.after(() => resumed.dispose()); const preview = await resumed.preview("mainnet"); assert.equal(preview.resumable, true);
  resumed.start("mainnet", preview.previewId); state = await finish(resumed); assert.equal(state.phase, "complete", state.error); assert.equal(state.result.movedFiles, 3); assert.equal(fs.existsSync(path.join(f.basedir, "chain")), false);
});

test("a writer appearing after stop blocks cleanup and preserves the source", async t => {
  const f = fixture(t); let injected = false;
  f.onExec(args => { if (!injected && args[0] === "ps" && fs.existsSync(path.join(f.target, "basedir/chain/0001.sst"))) { injected = true; f.setRows([{ id: "a".repeat(64), project: "unrelated", running: true, mounts: [{ Type: "bind", Source: f.basedir, Destination: "/data", RW: true }] }]); } });
  const state = await begin(f); assert.equal(state.phase, "failed"); assert.match(state.error, /Another Docker/); assert.ok(fs.existsSync(path.join(f.basedir, "chain/0001.sst"))); assert.equal(state.resumable, true);
});

test("completed journal safely removes its own finalization marker after interruption", async t => {
  const f = fixture(t), state = await begin(f); assert.equal(state.phase, "complete", state.error);
  fs.copyFileSync(path.join(f.basedir, MARKER), path.join(f.target, "basedir", MARKER));
  const recovered = f.make(); t.after(() => recovered.dispose()); assert.equal(recovered.status("mainnet").phase, "complete"); assert.equal(fs.existsSync(path.join(f.target, "basedir", MARKER)), false);
});

test("start requires a private reviewed ID and blocks conflicting plugin operations", async t => {
  const f = fixture(t); assert.throws(() => f.service.start("mainnet", "invented"), /Review/); const preview = await f.service.preview("mainnet"); f.manager._op = { running: true }; assert.throws(() => f.service.start("mainnet", preview.previewId), /current node operation/); f.manager._op = null;
  f.service.start("mainnet", preview.previewId); await assert.rejects(f.manager._assertControl("mainnet"), /migration/); await finish(f.service);
});

test("pause immediately after container retirement can resume from its preparation journal", async t => {
  const f = fixture(t); let paused = false;
  f.onExec(args => { if (!paused && args[0] === "ps" && f.calls.some(call => call[0] === "rm")) { paused = true; f.service.cancel(); } });
  let state = await begin(f); assert.equal(state.phase, "cancelled"); assert.equal(state.resumable, true); assert.equal(state.progress.completedFiles, 0); assert.equal(f.rows().length, 0);
  f.onExec(null); const resumed = f.make(); t.after(() => resumed.dispose()); const preview = await resumed.preview("mainnet"); assert.equal(preview.resumable, true);
  resumed.start("mainnet", preview.previewId); state = await finish(resumed); assert.equal(state.phase, "complete", state.error); assert.equal(state.result.movedFiles, 3);
});

test("failed cross-device source cleanup resumes the verified pending destination", async t => {
  const f = fixture(t), link = fsp.link, unlink = fs.unlinkSync;
  fsp.link = async (source, target) => { if (source.startsWith(f.basedir)) throw Object.assign(Error("cross-device"), { code: "EXDEV" }); return link(source, target); };
  let blocked = false;
  fs.unlinkSync = file => { if (!blocked && String(file).startsWith(f.basedir) && String(file).endsWith("0001.sst")) { blocked = true; throw Object.assign(Error("Synthetic cleanup lock"), { code: "EACCES" }); } return unlink(file); };
  t.after(() => { fsp.link = link; fs.unlinkSync = unlink; });
  let state = await begin(f); assert.equal(state.phase, "failed"); assert.ok(fs.existsSync(path.join(f.basedir, "chain/0001.sst"))); assert.ok(fs.existsSync(path.join(f.target, "basedir/chain/0001.sst")));
  const preview = await f.service.preview("mainnet"); f.service.start("mainnet", preview.previewId); state = await finish(f.service); assert.equal(state.phase, "complete", state.error);
});

test("cross-device crash after publication recognizes only its own extra staging link", async t => {
  const f = fixture(t), link = fsp.link, unlink = fs.unlinkSync;
  fsp.link = async (source, target) => { if (source.startsWith(f.basedir)) throw Object.assign(Error("cross-device"), { code: "EXDEV" }); return link(source, target); };
  let blocked = false;
  fs.unlinkSync = file => { if (!blocked && String(file).includes(".kai-chain-") && String(file).endsWith(".tmp")) { blocked = true; throw Object.assign(Error("Synthetic crash after publication"), { code: "EACCES" }); } return unlink(file); };
  t.after(() => { fsp.link = link; fs.unlinkSync = unlink; });
  let state = await begin(f); assert.equal(state.phase, "failed"); const record = JSON.parse(fs.readFileSync(path.join(f.dataRoot,".profile-migrations/mainnet.json"),"utf8")); const targetFile = path.join(f.target, "basedir", record.current.relative); assert.equal(fs.statSync(targetFile).nlink, 2); assert.ok(fs.existsSync(path.join(f.basedir, record.current.relative)));
  const resumed = f.make(); t.after(() => resumed.dispose()); const preview = await resumed.preview("mainnet"); resumed.start("mainnet", preview.previewId); state = await finish(resumed); assert.equal(state.phase, "complete", state.error); assert.equal(fs.statSync(targetFile).nlink, 1);
});

test("network changes without a journal reset the displayed migration state", async t => {
  const f = fixture(t); assert.equal((await begin(f)).phase, "complete"); assert.equal(f.service.status("harbinger").phase, "idle");
});

test("target changes during the final Docker check preserve the original cross-device source", async t => {
  const f = fixture(t), link = fsp.link;
  fsp.link = async (source, target) => { if (source.startsWith(f.basedir)) throw Object.assign(Error("cross-device"), { code: "EXDEV" }); return link(source, target); };
  t.after(() => { fsp.link = link; });
  let changed;
  f.onExec(args => {
    if (changed || args[0] !== "ps") return;
    const file = path.join(f.dataRoot, ".profile-migrations/mainnet.json"); if (!fs.existsSync(file)) return;
    const current = JSON.parse(fs.readFileSync(file, "utf8")).current; if (!current) return;
    const destination = path.join(f.target, "basedir", current.relative); if (!fs.existsSync(destination)) return;
    fs.writeFileSync(destination, Buffer.alloc(current.bytes, 8)); changed = current.relative;
  });
  const state = await begin(f); assert.equal(state.phase, "failed"); assert.match(state.error, /destination changed/); assert.ok(changed); assert.ok(fs.existsSync(path.join(f.basedir, changed))); assert.equal(state.resumable, true);
});

test("preparing journal is exposed as a resumable paused operation after restart", async t => {
  const f = fixture(t); let pause = false;
  f.onExec(args => { if (!pause && args[0] === "ps" && f.calls.some(call => call[0] === "rm")) { pause = true; f.service.cancel(); } });
  const state = await begin(f); assert.equal(state.phase, "cancelled");
  const file = path.join(f.dataRoot,".profile-migrations/mainnet.json"), record = JSON.parse(fs.readFileSync(file,"utf8")); record.phase = "preparing"; fs.writeFileSync(file,JSON.stringify(record));
  const restarted = f.make(); t.after(() => restarted.dispose()); assert.equal(restarted.status("mainnet").phase,"cancelled"); assert.equal(restarted.status("mainnet").resumable,true); assert.equal((await restarted.preview("mainnet")).resumable,true);
});

test("a completed migration remains readable after the old profile is removed", async t => {
  const f = fixture(t); assert.equal((await begin(f)).phase,"complete"); fs.rmSync(path.join(f.root,"old"),{recursive:true,force:true}); const restarted=f.make(); t.after(()=>restarted.dispose()); assert.equal(restarted.status("mainnet").phase,"complete");
});
