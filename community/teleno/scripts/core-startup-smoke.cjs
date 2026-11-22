"use strict";
// Author integration test: actual signed plugin, Core host/bridge and native
// service in a disposable fresh profile. Only the OS folder-picker reply is simulated. Native review uses Core's real
// trusted dialog. No node starts or live funds are used.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),assert=require("node:assert/strict");
const core=process.env.KAI_CORE_SOURCE;
if(!core)throw Error("Set KAI_CORE_SOURCE to the Core source checkout for this author test.");
const {_electron}=require(path.join(core,"node_modules/playwright-core"));
async function main(){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"teleno-core-startup-"))),profile=path.join(root,"profile"),output=path.resolve(process.env.KAI_STARTUP_SMOKE_OUTPUT||path.join(os.tmpdir(),"teleno-core-startup-report"));fs.mkdirSync(output,{recursive:true});
  require(path.join(core,"electron/foundation-profile")).prepareFoundationProfile(profile);
  fs.writeFileSync(path.join(profile,"settings.json"),JSON.stringify({interface:{language:"en"},network:{privacyMode:"local-only"},earn:{autoStart:false}}));
  const {assemble}=require("./assemble-signed-package"),packageFile=process.env.KAI_SMOKE_PLUGIN_PACKAGE||path.resolve(__dirname,"../dist",assemble().asset),manager=new(require(path.join(core,"core/lib/plugins/manager")).PluginManager)(profile);
  manager.install(JSON.parse(fs.readFileSync(packageFile,"utf8")),{trustNative:true});
  const drive=path.join(root,"USB drive"),original=path.join(manager.dataDir("community.teleno-node"),"chains","mainnet"),fixture="disposable chain-copy fixture";
  fs.mkdirSync(drive);fs.mkdirSync(path.join(original,"db"),{recursive:true});fs.writeFileSync(path.join(original,"db","fixture.bin"),fixture);
  fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({name:"teleno-core-startup-fixture",version:"1.0.0",main:"main.cjs"}));
  fs.writeFileSync(path.join(root,"main.cjs"),`require(${JSON.stringify(path.join(core,"scripts/foundation/apps-fixture.js"))}).install(${JSON.stringify({appRoot:core,appData:path.join(root,"app-data"),reportFile:path.join(root,"exit.json"),syntheticKeychain:true,realDialogs:true})});
    const {dialog}=require('electron');global.__telenoRouting={pick:{canceled:true,filePaths:[]},picks:[],storage:[],methods:[]};
    dialog.showOpenDialog=async(parent,options)=>{global.__telenoRouting.picks.push({parent:parent?.id,title:options.title,properties:options.properties});return structuredClone(global.__telenoRouting.pick);};
    const {PluginManager}=require(${JSON.stringify(path.join(core,"core/lib/plugins/manager"))}),storage=PluginManager.prototype.storage;
    PluginManager.prototype.storage=function(id,action,key,value){if(id==='community.teleno-node')global.__telenoRouting.storage.push({action,key});return storage.call(this,id,action,key,value);};
    const {FoundationPluginServices}=require(${JSON.stringify(path.join(core,"electron/foundation-plugin-services"))}),call=FoundationPluginServices.prototype.call;
    FoundationPluginServices.prototype.call=function(record,method,input){if(record.manifest.id==='community.teleno-node')global.__telenoRouting.methods.push(method);return call.call(this,record,method,input);};
    require(${JSON.stringify(path.join(core,"electron/core-main.js"))});`);
  const args=[...(process.platform==="linux"&&!process.env.DISPLAY?["--ozone-platform=headless"]:[]),...(process.getuid?.()===0?["--no-sandbox"]:[]),root],env={...process.env,KAI_CORE_DATA:profile,KAI_CORE_PORT:"0",KAI_CHANNEL:"core"};delete env.ELECTRON_RUN_AS_NODE;
  let app,logs="";const report={realCore:true,signedPlugin:true,freshProfile:true,syntheticKeychain:true,syntheticPicker:true,checks:[]},id="community.teleno-node";
  const evaluate=expression=>app.evaluate(async(_e,{id,expression})=>global.__foundationHost.renderer(id).executeJavaScript(expression,true),{id,expression});
  const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(error){if(!error.message.includes("Resulting promise was garbage collected"))throw error;}await new Promise(r=>setTimeout(r,100));}throw Error(label);};
  try{
    app=await _electron.launch({executablePath:require(path.join(core,"node_modules/electron")),args,env,timeout:60000});for(const stream of [app.process().stdout,app.process().stderr])stream?.on("data",s=>logs=(logs+s).slice(-30000));
    const page=await app.firstWindow();await app.evaluate(()=>global.__foundationWindow.setContentSize(1280,900));await page.waitForFunction(()=>document.getElementById("version")?.textContent.startsWith("v"),{timeout:60000});
    await page.locator(`[data-app="${id}"]`).click();await until(()=>app.evaluate((_e,id)=>global.__foundationHost.windows.get(id)?.ready===true,id),"Plugin host did not become ready");
    await until(()=>evaluate('!!document.querySelector(".dashboard-snapshot")'),"Overview stayed on Loading Teleno");
    const state=await evaluate('({hidden:document.hidden,text:document.getElementById("mining-panel").innerText,notice:document.getElementById("notice").innerText,node:typeof require})');assert.match(state.text,/Node stopped/);assert.match(state.text,/Set up wallet|Set up a wallet/);assert.equal(state.node,"undefined");report.checks.push("Fresh signed plugin opens its overview through real Core protocol, preload, IPC and native status");report.state=state;
    await evaluate(`document.querySelector('nav [data-page="setup"]').click();true`);
    const clickFolder=()=>evaluate(`document.querySelector('[data-action="storage-choose"]').click();true`);
    const settled=()=>until(()=>evaluate('busy===false'),"Folder choice did not settle");
    await clickFolder();await settled();
    const cancelled=await app.evaluate(()=>global.__telenoRouting);
    assert.equal(cancelled.picks.length,1,"Folder button never reached the native picker: "+await evaluate('document.getElementById("notice").textContent'));
    assert.equal(cancelled.picks[0].title,"Choose Teleno chain drive or folder");assert.ok(cancelled.picks[0].parent);assert.ok(cancelled.picks[0].properties.includes("openDirectory"));assert.deepEqual(cancelled.storage,[]);
    report.checks.push("Actual folder button reaches the OS picker through real Core dispatch; cancelling preserves the location");
    const before=await evaluate('window.kai.call("chainStorage.info",{})');assert.equal(before.custom,false);assert.equal(before.path,original);
    async function review(approve){
      await app.evaluate((_e,drive)=>{global.__telenoRouting.pick={canceled:false,filePaths:[drive]};},drive);
      const opened=app.waitForEvent("window",{timeout:20000});await clickFolder();const popup=await opened;
      await popup.waitForURL(/\/dialog\.html$/);await popup.locator("#dialog-ready").waitFor({state:"visible"});
      const detail=await popup.locator("#dialog-detail").innerText();assert.ok(detail.includes(drive));assert.ok(detail.includes(original));
      await popup.getByRole("button",{name:approve?"Allow once":"Cancel",exact:true}).click();await settled();
    }
    await review(false);const declined=await evaluate('window.kai.call("chainStorage.info",{})');assert.equal(declined.custom,false);assert.equal(declined.pending,null);assert.ok(fs.existsSync(path.join(original,"db","fixture.bin")));
    report.checks.push("Declining the real trusted native review preserves the original chain and creates no copy task");
    await review(true);await until(async()=>{const v=await evaluate('window.kai.call("chainStorage.info",{})');if(v.job?.state==="failed")throw Error(v.job.error);return v.custom&&v.ready&&v.job?.state==="complete";},"Reviewed chain copy did not finish");
    const chosen=await evaluate('window.kai.call("chainStorage.info",{})');assert.ok(chosen.path.startsWith(path.join(drive,"Teleno")+path.sep));assert.equal(fs.readFileSync(path.join(chosen.path,"db","fixture.bin"),"utf8"),fixture);assert.equal(fs.readFileSync(path.join(original,"db","fixture.bin"),"utf8"),fixture);
    assert.equal((await evaluate('window.kai.call("status",{})')).runtime.mode,"stopped");assert.equal((await evaluate('window.kai.call("status",{})')).wallet.exists,false);
    for(const method of ["chainStorage.cancel","chainStorage.resume","chainStorage.keepOriginal"]){const result=await evaluate(`window.kai.call(${JSON.stringify(method)},{}).then(value=>({value}),error=>({error:String(error.message)}))`);assert.ok(!result.error?.includes("Invalid storage key"));}
    await app.evaluate((_e,id)=>{global.__foundationHost.renderer(id).reload();},id);await until(()=>evaluate('!!document.querySelector(".dashboard-snapshot")'),"Reopened plugin did not load");assert.equal((await evaluate('window.kai.call("chainStorage.info",{})')).path,chosen.path);
    const routing=await app.evaluate(()=>global.__telenoRouting);assert.deepEqual(routing.storage,[]);for(const method of ["chainStorage.choose","chainStorage.info","chainStorage.cancel","chainStorage.resume","chainStorage.keepOriginal"])assert.ok(routing.methods.includes(method));assert.ok(!routing.methods.some(method=>/^(node\.|producer\.|wallet\.(create|import|send|burn))/.test(method)));
    assert.ok(!fs.existsSync(path.join(manager.dataDir(id),"storage.json")));
    report.checks.push("Approved picker choice copies and verifies chain files with originals retained, survives view reopen and performs no Core key/value writes or node start");report.status="passed";
  }catch(error){report.status="failed";report.error=error.stack;if(app){report.diagnostics=await evaluate('({hidden:document.hidden,ready:document.readyState,text:document.body.innerText,notice:document.getElementById("notice")?.innerText,mining:typeof TelenoMining,app:typeof refresh})').catch(e=>({error:e.message}));report.rendererErrors=await app.evaluate(()=>global.__foundationSmoke.errors).catch(()=>[]);}throw error;
  }finally{report.logs=logs;fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2));if(app){await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});console.log(JSON.stringify(report,null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
