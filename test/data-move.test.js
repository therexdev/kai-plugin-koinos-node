"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), fsp = require("node:fs/promises");
const os = require("node:os"), path = require("node:path");
const { NodeManager } = require("../plugin/service/core/lib/koinos/node-manager");

function fixture(t, existing = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kai-data-move-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "original"), target = path.join(root, "Koinosnode2");
  fs.mkdirSync(path.join(source, "mainnet", "basedir"), { recursive: true });
  const relative = path.join("mainnet", "basedir", "chain.bin");
  const bytes = Buffer.from("original chain data\0\xff");
  fs.writeFileSync(path.join(source, relative), bytes);
  if (existing) fs.mkdirSync(target);
  const manager = new NodeManager({ dataRoot: source, autoRecover: false });
  // Exercise real copying, verification and publication against disposable data.
  manager.filesReady = () => false;
  let saved = source;
  const move = () => manager.moveData("mainnet", target, { onSwitched: dir => {
    assert.deepEqual(fs.readFileSync(path.join(dir, relative)), bytes);
    assert.ok(fs.existsSync(source), "source must survive until the setting is saved");
    saved = dir;
  } });
  const preserved = () => {
    assert.deepEqual(fs.readFileSync(path.join(source, relative)), bytes);
    assert.equal(saved, source);
    assert.equal(manager.dataRoot, source);
    assert.equal(manager.moveStatus().phase, "error");
  };
  return { root, source, target, relative, bytes, manager, move, preserved, saved: () => saved };
}

test("move into the folder picker's existing empty directory works with Windows rename rules", async t => {
  const f = fixture(t), rename = fsp.rename;
  t.mock.method(fsp, "rename", async (from, to) => {
    if (fs.existsSync(to)) throw Object.assign(new Error("destination exists"), { code: "EPERM" });
    return rename(from, to);
  });
  assert.equal((await f.move()).moved, true);
  assert.equal(f.saved(), f.target);
  assert.deepEqual(fs.readFileSync(path.join(f.target, f.relative)), f.bytes);
  assert.equal(fs.existsSync(f.source), false);
  assert.equal(f.manager.moveStatus().phase, "done");
});

test("move still supports a destination that does not exist", async t => {
  const f = fixture(t, false);
  assert.equal((await f.move()).moved, true);
  assert.equal(f.saved(), f.target);
});

test("files added to the destination during copying are never removed", async t => {
  const f = fixture(t);
  f.manager.onEvent = ({ move }) => {
    if (move.phase === "switching") fs.writeFileSync(path.join(f.target, "keep.txt"), "keep");
  };
  await assert.rejects(f.move());
  f.preserved();
  assert.equal(fs.readFileSync(path.join(f.target, "keep.txt"), "utf8"), "keep");
});

test("the final empty-directory removal cannot recursively erase a concurrent file", async t => {
  const f = fixture(t), rmdir = fsp.rmdir;
  t.mock.method(fsp, "rmdir", async (dir, options) => {
    if (dir === f.target) {
      assert.equal(options?.recursive, undefined);
      fs.writeFileSync(path.join(dir, "keep.txt"), "keep");
    }
    return rmdir(dir, options);
  });
  await assert.rejects(f.move());
  f.preserved();
  assert.equal(fs.readFileSync(path.join(f.target, "keep.txt"), "utf8"), "keep");
});

test("a destination replaced by a directory link is rejected without touching its target", async t => {
  const f = fixture(t), other = path.join(f.root, "other");
  fs.mkdirSync(other);
  f.manager.onEvent = ({ move }) => {
    if (move.phase === "switching") {
      fs.rmdirSync(f.target);
      fs.symlinkSync(other, f.target, process.platform === "win32" ? "junction" : "dir");
    }
  };
  await assert.rejects(f.move(), /real directory/);
  f.preserved();
  assert.ok(fs.lstatSync(f.target).isSymbolicLink());
  assert.ok(fs.existsSync(other));
});

test("a locked empty destination leaves the original and its setting intact", async t => {
  const f = fixture(t), rmdir = fsp.rmdir;
  t.mock.method(fsp, "rmdir", async (dir, options) => {
    if (dir === f.target) throw Object.assign(new Error("folder locked"), { code: "EPERM" });
    return rmdir(dir, options);
  });
  await assert.rejects(f.move(), /folder locked/);
  f.preserved();
});

test("a rename failure preserves the original and a subsequent retry succeeds", async t => {
  const f = fixture(t);
  const mocked = t.mock.method(fsp, "rename", async () => {
    throw Object.assign(new Error("rename locked"), { code: "EPERM" });
  });
  await assert.rejects(f.move(), /rename locked/);
  f.preserved();
  mocked.mock.restore();
  fs.mkdirSync(f.target, { recursive: true });
  assert.equal((await f.move()).moved, true);
  assert.equal(f.saved(), f.target);
});
