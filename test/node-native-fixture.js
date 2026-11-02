"use strict";
// Test-only instrumentation: the real Core host, SDK, renderer and Node service
// run against disposable profiles. No live RPC, Docker or external program runs.
function install({ coreRoot, appData, reportFile, rows }) {
  const path = require("node:path");
  require(path.join(coreRoot, "scripts/foundation/apps-fixture.js"))
    .install({ appRoot: coreRoot, appData, reportFile, syntheticKeychain: true });
  const { EventEmitter } = require("node:events"), { PassThrough } = require("node:stream");
  const state = global.__nodeNativeFixture = { rows: structuredClone(rows), requests: [], processes: [], dialogs: [], approveMigration: false };
  const blocked = () => Object.assign(new Error("Node native smoke blocks live network and external processes"), { code: "KAI_SMOKE_BLOCKED" });
  const recordRequest = raw => {
    let origin = "unknown";
    try { origin = new URL(typeof raw === "string" || raw instanceof URL ? String(raw) : raw?.url || "").origin; } catch {}
    state.requests.push(origin);
  };
  global.fetch = async raw => { recordRequest(raw); throw blocked(); };
  for (const name of ["node:http", "node:https"]) {
    const module = require(name);
    module.request = module.get = raw => { recordRequest(raw); throw blocked(); };
  }
  const electron = require("electron");
  electron.dialog.showMessageBox = async (parent, options) => {
    const value = options || parent;
    state.dialogs.push({ title: value.title, message: value.message, detail: value.detail, buttons: value.buttons });
    const migration = /Stop the old Node and import selected settings and data/.test(value.message || "");
    return { response: migration && state.approveMigration ? value.buttons.indexOf("Allow once") : value.cancelId ?? 0 };
  };
  const processModule = require("node:child_process");
  const child = () => {
    const result = new EventEmitter();
    result.stdout = new PassThrough(); result.stderr = new PassThrough(); result.stdin = new PassThrough();
    result.pid = -1; result.kill = () => true; result.unref = () => {};
    return result;
  };
  for (const method of ["execFile", "exec", "spawn"]) processModule[method] = (...args) => {
    state.processes.push({ method, command: String(args[0]), args: Array.isArray(args[1]) ? args[1] : [] });
    const result = child(), callback = args.findLast(value => typeof value === "function");
    const answer = method === "execFile" && args[0] === "docker" && Array.isArray(args[1]) ? dockerResponse(state, args[1]) : null;
    setImmediate(() => {
      if (callback) callback(answer === null ? blocked() : null, answer || "", "");
      else if (answer === null) result.emit("error", blocked());
      else result.stdout.write(answer);
      result.stdout.end(); result.stderr.end(); result.emit("exit", answer === null ? 1 : 0); result.emit("close", answer === null ? 1 : 0);
    });
    return result;
  };
  for (const method of ["execFileSync", "execSync", "spawnSync"]) processModule[method] = (...args) => {
    state.processes.push({ method, command: String(args[0]), args: [] }); throw blocked();
  };
}
function dockerResponse(state, args) {
  if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock");
  if (args[0] === "ps" && args.includes("--all")) return state.rows.map(row => row.id.slice(0, 12)).join("\n");
  if (args[0] === "inspect" && args[1] === "--format") {
    const ids = args.slice(3);
    if (ids.length !== state.rows.length || ids.some(id => !state.rows.some(row => row.id.startsWith(id)))) return null;
    return state.rows.map(row => JSON.stringify(row)).join("\n");
  }
  const ids = args[0] === "update" && args[1] === "--restart=no" ? args.slice(2)
    : args[0] === "stop" && args[1] === "--time" && args[2] === "120" ? args.slice(3)
    : args[0] === "rm" ? args.slice(1) : null;
  if (!ids || ids.length !== state.rows.length || ids.some(id => !state.rows.some(row => row.id === id))) return null;
  if (args[0] === "stop") state.rows.forEach(row => { row.running = false; });
  if (args[0] === "rm") { if (state.rows.some(row => row.running)) return null; state.rows = []; }
  return "";
}
module.exports = { install, dockerResponse };
