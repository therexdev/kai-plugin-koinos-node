"use strict";
// Real Electron/Core and installed Node package, with synthetic Docker/RPC only.
// KAI_CORE_SOURCE=/path/to/kai-core node scripts/test-node-native.cjs
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const crypto = require("node:crypto"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."), coreRoot = path.resolve(process.env.KAI_CORE_SOURCE || path.join(root, "../kai-core"));
const { _electron: electron } = require(path.join(coreRoot, "node_modules/playwright-core"));
const electronPath = require(path.join(coreRoot, "node_modules/electron"));
const { waitForInspectorObservation } = require(path.join(coreRoot, "scripts/foundation/inspector-observation"));
const { signingPayload, BINARY, verifyPackage } = require(path.join(coreRoot, "core/lib/plugins/package"));
const id = "kai.koinos-node";
function installSource(manager) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin/manifest.json"))), publisher = require(path.join(root, "publisher.json"));
  const artifact = path.join(root, "dist", `kai-plugin-koinos-node-${manifest.version}.kaiplugin`);
  if (fs.existsSync(artifact)) {
    const verified = verifyPackage(fs.readFileSync(artifact, "utf8"));
    assert.equal(verified.fingerprint, publisher.fingerprint); assert.deepEqual(verified.manifest, manifest);
    manager.install(verified.package, { trustNative: true }); return { manifest, publisherSignedPackage: true };
  }
  const files = {}, source = path.join(root, "plugin"), key = crypto.generateKeyPairSync("ed25519");
  function walk(dir, prefix = "") {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      assert.equal(item.isSymbolicLink(), false); const file = prefix + item.name;
      if (item.isDirectory()) walk(path.join(dir, item.name), file + "/");
      else if (file !== "manifest.json") files[file] = fs.readFileSync(path.join(dir, item.name)).toString(BINARY.test(file) ? "base64" : "utf8");
    }
  }
  walk(source);
  const pkg = { manifest, files, publicKey: key.publicKey.export({ format: "der", type: "spki" }).toString("base64"), signature: crypto.sign(null, Buffer.from(signingPayload(manifest, files)), key.privateKey).toString("base64") };
  verifyPackage(pkg); manager.install(pkg, { trustNative: true }); return { manifest, publisherSignedPackage: false };
}
async function main() {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kai-node-native-"))), profile = path.join(temp, "profile");
  const output = path.resolve(process.env.KAI_NODE_NATIVE_OUTPUT || path.join(os.tmpdir(), "kai-node-native-smoke")); fs.mkdirSync(output, { recursive: true });
  const report = { platform: process.platform, realCore: true, realElectron: true, realNodeService: true, syntheticProfile: true, syntheticKeychain: true, syntheticDocker: true, syntheticNativeReviewChoices: true, liveNetwork: false, liveDocker: false, checks: [], screenshots: [] };
  require(path.join(coreRoot, "electron/foundation-profile")).prepareFoundationProfile(profile);
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ interface: { language: "en" }, network: { privacyMode: "local-only" }, earn: { autoStart: false } }));
  const manager = new (require(path.join(coreRoot, "core/lib/plugins/manager")).PluginManager)(profile);
  const installed = installSource(manager); assert.equal(installed.manifest.id, id); report.publisherSignedPackage = installed.publisherSignedPackage;
  const { Signer, utils } = require(path.join(root, "plugin/service/node_modules/koilib"));
  const owner = new Signer({ privateKey: crypto.randomBytes(32) }), hot = new Signer({ privateKey: crypto.randomBytes(32) });
  const legacyCore = path.join(temp, "Koinos AI", "core"), source = path.join(legacyCore, "koinos-node", "node", "mainnet"), basedir = path.join(source, "basedir");
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { mode: 0o600 }); };
  write(path.join(legacyCore, "koinos-node/settings.json"), JSON.stringify({ network: "mainnet", producer: { mode: "external", addresses: { mainnet: owner.getAddress() } }, node: { autoRecover: true } }));
  write(path.join(source, "config/config.yml"), `block_producer:\n  producer: ${owner.getAddress()}\n`);
  write(path.join(source, "config/genesis_data.json"), fs.readFileSync(path.join(root, "plugin/service/core/koinos-node-template/mainnet/genesis_data.json")));
  write(path.join(basedir, "block_producer/private.key"), hot.getPrivateKey("wif") + "\n");
  write(path.join(basedir, "block_producer/public.key"), utils.encodeBase64url(hot.publicKey) + "\n");
  write(path.join(basedir, "chain/fixture.sst"), "synthetic chain bytes"); write(path.join(basedir, "block_store/fixture.sst"), "synthetic block bytes");
  const rows = ["chain", "block_store"].map((service, index) => ({ id: String(index + 1).repeat(64), project: "koinos-desktop-mainnet", root: source, service, image: "koinos/koinos-" + service.replaceAll("_", "-") + ":latest", running: true, paused: false, mounts: [{ Type: "bind", Source: basedir, Destination: "/koinos", RW: true }] }));
  const exitReport = path.join(temp, "exit.json");
  write(path.join(temp, "package.json"), JSON.stringify({ name: "kai-node-native-smoke", version: require(path.join(coreRoot, "package.json")).version, main: "desktop.js" }));
  write(path.join(temp, "desktop.js"), `"use strict";require(${JSON.stringify(path.join(root, "test/node-native-fixture.js"))}).install(${JSON.stringify({ coreRoot, appData: path.join(temp, "app-data"), reportFile: exitReport, rows })});require(${JSON.stringify(path.join(coreRoot, "electron/core-main.js"))});`);
  const args = []; if (process.platform === "linux" && process.getuid?.() === 0) args.push("--no-sandbox"); if (process.platform === "linux" && !process.env.DISPLAY) args.push("--ozone-platform=headless"); args.push(temp);
  const env = { ...process.env, KAI_CORE_DATA: profile, KAI_CORE_PORT: "0", KAI_CHANNEL: "core", KAI_SMOKE_SYNTHETIC_LOCK: "1" }; delete env.ELECTRON_RUN_AS_NODE; delete env.KAI_CORE_TOKEN; delete env.KAI_SESSION_SECRET;
  let application, page, logs = "";
  const appEval = expression => application.evaluate(async (_electron, { id, expression }) => global.__foundationHost.renderer(id).executeJavaScript(expression, true), { id, expression });
  const until = (observe, message) => waitForInspectorObservation(observe, { message, timeoutMs: 60000 });
  const click = element => appEval(`document.getElementById(${JSON.stringify(element)}).click();true`);
  const check = async (name, run) => { await run(); report.checks.push(name); console.log("PASS", name); };
  const capture = async name => {
    // State assertions may finish before Chromium has painted the toggle
    // transitions. Capture their settled appearance, not an intermediate frame.
    await appEval("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))).then(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))).then(()=>true)");
    const file = path.join(output, name + ".png"); await application.evaluate((_electron, { id, file }) => global.__foundationCapture(file, id), { id, file }); report.screenshots.push(file);
  };
  try {
    application = await electron.launch({ executablePath: electronPath, args, env, timeout: 60000 });
    for (const stream of [application.process().stdout, application.process().stderr]) stream?.on("data", chunk => { logs = (logs + chunk).slice(-50000); });
    page = await application.firstWindow({ timeout: 60000 }); await application.evaluate(() => global.__foundationWindow.setContentSize(1280, 1000));
    await page.waitForFunction(() => document.getElementById("version")?.textContent.startsWith("v"), null, { timeout: 60000 });
    await page.locator(`[data-app="${id}"]`).click();
    await until(() => application.evaluate((_electron, id) => global.__foundationHost.windows.get(id)?.ready && global.__foundationHost.selected === id, id), "Node plugin did not become ready");
    await until(() => appEval("typeof S !== 'undefined' && !!S.appInfo && !!document.getElementById('view-node').children.length"), "Node renderer did not initialize");
    await check("Actual plugin opens through Core with an isolated renderer and empty wallet", async () => {
      assert.deepEqual(await appEval("({node:typeof require,core:typeof window.kaiCore,bridge:typeof window.kai.call})"), { node: "undefined", core: "undefined", bridge: "function" });
      const info = await appEval("window.kai.call('node.read',{channel:'app:info'})"), wallet = await appEval("window.kai.call('node.read',{channel:'wallet:status'})");
      assert.equal(info.version, installed.manifest.version); assert.equal(wallet.exists, false); assert.ok(info.userData.startsWith(manager.dataDir(id) + path.sep));
    });
    await appEval("document.querySelector('[data-view=\"node\"]').click();true");
    await until(() => appEval("!!document.querySelector('[data-open-node-migration]')"), "Migration entry point is missing");
    await appEval("document.querySelector('[data-open-node-migration]').click();true");
    await until(() => appEval("document.getElementById('node-migration-dialog').open && document.getElementById('node-migration-option-settings').checked && !document.getElementById('node-migration-option-settings').disabled"), "Migration choices did not load");
    await check("Native discovery exposes producer identity and preservation defaults in the actual migration dialog", async () => {
      const values = await appEval("({chain:document.getElementById('node-migration-option-chain').checked,key:document.getElementById('node-migration-option-signingKey').checked,wallet:document.getElementById('node-migration-option-wallet').checked,walletDisabled:document.getElementById('node-migration-option-wallet').disabled,address:document.getElementById('node-migration-producer-address').textContent,canStart:!document.getElementById('node-migration-submit').disabled})");
      assert.deepEqual(values, { chain: true, key: true, wallet: false, walletDisabled: true, address: owner.getAddress(), canStart: false }); await capture("migration-review-en");
    });
    await check("Changing migration options requires a fresh acknowledgement and language changes preserve choices", async () => {
      await click("node-migration-acknowledge"); await click("node-migration-option-chain");
      await until(() => appEval("!document.getElementById('node-migration-option-chain').disabled"), "Changed selection did not finish review");
      assert.equal(await appEval("document.getElementById('node-migration-acknowledge').checked"), false);
      assert.equal(await appEval("document.getElementById('node-migration-submit').disabled"), true);
      await page.evaluate(() => window.kaiCore.locale.set("es"));
      await until(() => appEval("document.documentElement.lang==='es'"), "Core language did not reach the open dialog");
      assert.equal(await appEval("document.getElementById('node-migration-option-chain').checked"), false);
      assert.equal(await appEval("document.getElementById('node-migration-producer-address').textContent"), owner.getAddress()); await capture("migration-review-es");
      await page.evaluate(() => window.kaiCore.locale.set("en")); await click("node-migration-option-chain");
      await until(() => appEval("!document.getElementById('node-migration-option-chain').disabled"), "Restored selection did not finish review");
    });
    await check("Native review cancellation leaves the existing node and files untouched", async () => {
      await click("node-migration-acknowledge"); await click("node-migration-submit");
      await until(() => appEval("document.getElementById('node-migration-error').textContent.includes('Migration was not started')"), "Cancellation did not return to review");
      const state = await application.evaluate(() => global.__nodeNativeFixture);
      assert.equal(state.processes.some(command => command.command === "docker" && command.args[0] === "stop"), false);
      assert.ok(state.dialogs.some(dialog => dialog.detail?.includes(owner.getAddress()))); assert.ok(fs.existsSync(path.join(basedir, "chain/fixture.sst")));
    });
    await application.evaluate(() => { global.__nodeNativeFixture.approveMigration = true; });
    await click("node-migration-submit");
    await until(() => appEval("document.getElementById('node-migration-outcome-title').textContent==='Selected node data imported'"), "Synthetic migration did not complete");
    await check("Approved native migration copies source files and the existing hot key with production off", async () => {
      const target = path.join(manager.dataDir(id), "koinos-node/node/mainnet/basedir"), settings = JSON.parse(fs.readFileSync(path.join(manager.dataDir(id), "koinos-node/settings.json")));
      for (const relative of ["chain/fixture.sst", "block_store/fixture.sst", "block_producer/private.key", "block_producer/public.key"]) assert.deepEqual(fs.readFileSync(path.join(target, relative)), fs.readFileSync(path.join(basedir, relative)));
      assert.equal(settings.producer.mode, "external"); assert.equal(settings.producer.addresses.mainnet, owner.getAddress()); assert.equal(settings.node.autoRecover, false); assert.equal(settings.rewards.enabled, false);
      assert.equal(fs.existsSync(path.join(manager.dataDir(id), "wallet/wallet.json")), false);
      const state = await application.evaluate(() => global.__nodeNativeFixture);
      assert.equal(state.rows.length, 0); assert.equal(state.processes.some(command => command.args.includes("up")), false);
      assert.equal(JSON.stringify(state.dialogs).includes(hot.getPrivateKey("wif")), false); await capture("migration-complete");
    });
    await click("node-migration-close");
    await check("Node renderer survives navigation and Core tray without restarting production", async () => {
      const before = await application.evaluate((_electron, id) => global.__foundationHost.renderer(id).id, id);
      await page.locator('[data-page="plugins"]').click(); await application.evaluate(() => global.__foundationWindow.close());
      await until(() => application.evaluate(() => !global.__foundationWindow.isVisible()), "Core did not enter tray");
      await application.evaluate(() => global.__foundationTray.show()); await page.locator(`[data-app="${id}"]`).click();
      assert.equal(await application.evaluate((_electron, id) => global.__foundationHost.renderer(id).id, id), before);
    });
    const child = application.process(), ended = new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error("Core did not quit after 30 seconds")), 30000); child.once("exit", code => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error("Core exit " + code)); }); });
    await application.evaluate(() => setTimeout(() => global.__foundationTrayMenu.find(item => item.label === "Quit KAI Core Beta").click(), 0)); await ended; application = null;
    report.exit = JSON.parse(fs.readFileSync(exitReport)); assert.equal(report.exit.remainingServices, 0); assert.equal(report.exit.remainingViews, 0); assert.deepEqual(report.exit.errors, []);
    report.checks.push("Normal Core quit drains all plugin services and renderers"); report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = error.stack || String(error); throw error; }
  finally {
    if (application) {
      const child = application.process(), exited = () => child.exitCode !== null || child.signalCode !== null;
      const ended = exited() ? Promise.resolve() : new Promise(resolve => child.once("exit", resolve));
      const bounded = async (promise, ms) => { let timer; try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, ms); })]); } finally { clearTimeout(timer); } };
      if (!exited()) await bounded(application.evaluate(() => setTimeout(() => global.__foundationTrayMenu?.find(item => item.label === "Quit KAI Core Beta")?.click(), 0)).catch(() => {}), 3000);
      if (!exited()) await bounded(ended, 5000); if (!exited()) { child.kill("SIGKILL"); await bounded(ended, 3000); }
    }
    report.logs = logs; fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); console.log("Native report", path.join(output, "report.json"));
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
