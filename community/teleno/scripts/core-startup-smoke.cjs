"use strict";
// Author integration test: actual signed plugin, Core host/bridge and native
// service in a disposable fresh profile. No node starts or live funds are used.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),assert=require("node:assert/strict");
const core=process.env.KAI_CORE_SOURCE;
if(!core)throw Error("Set KAI_CORE_SOURCE to the Core source checkout for this author test.");
const {_electron}=require(path.join(core,"node_modules/playwright-core"));
async function main(){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"teleno-core-startup-"))),profile=path.join(root,"profile"),output=path.resolve(process.env.KAI_STARTUP_SMOKE_OUTPUT||path.join(os.tmpdir(),"teleno-core-startup-report"));fs.mkdirSync(output,{recursive:true});
  require(path.join(core,"electron/foundation-profile")).prepareFoundationProfile(profile);
  fs.writeFileSync(path.join(profile,"settings.json"),JSON.stringify({interface:{language:"en"},network:{privacyMode:"local-only"},earn:{autoStart:false}}));
  const {assemble}=require("./assemble-signed-package"),{asset}=assemble(),manager=new(require(path.join(core,"core/lib/plugins/manager")).PluginManager)(profile);
  manager.install(JSON.parse(fs.readFileSync(path.resolve(__dirname,"../dist",asset),"utf8")),{trustNative:true});
  fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({name:"teleno-core-startup-fixture",version:"1.0.0",main:"main.cjs"}));
  fs.writeFileSync(path.join(root,"main.cjs"),`require(${JSON.stringify(path.join(core,"scripts/foundation/apps-fixture.js"))}).install(${JSON.stringify({appRoot:core,appData:path.join(root,"app-data"),reportFile:path.join(root,"exit.json"),syntheticKeychain:true})});require(${JSON.stringify(path.join(core,"electron/core-main.js"))});`);
  const args=[...(process.platform==="linux"&&!process.env.DISPLAY?["--ozone-platform=headless"]:[]),...(process.getuid?.()===0?["--no-sandbox"]:[]),root],env={...process.env,KAI_CORE_DATA:profile,KAI_CORE_PORT:"0",KAI_CHANNEL:"core"};delete env.ELECTRON_RUN_AS_NODE;
  let app,logs="";const report={realCore:true,signedPlugin:true,freshProfile:true,syntheticKeychain:true,checks:[]},id="community.teleno-node";
  const evaluate=expression=>app.evaluate(async(_e,{id,expression})=>global.__foundationHost.renderer(id).executeJavaScript(expression,true),{id,expression});
  const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(error){if(!error.message.includes("Resulting promise was garbage collected"))throw error;}await new Promise(r=>setTimeout(r,100));}throw Error(label);};
  try{
    app=await _electron.launch({executablePath:require(path.join(core,"node_modules/electron")),args,env,timeout:60000});for(const stream of [app.process().stdout,app.process().stderr])stream?.on("data",s=>logs=(logs+s).slice(-30000));
    const page=await app.firstWindow();await app.evaluate(()=>global.__foundationWindow.setContentSize(1280,900));await page.waitForFunction(()=>document.getElementById("version")?.textContent.startsWith("v"),{timeout:60000});
    await page.locator(`[data-app="${id}"]`).click();await until(()=>app.evaluate((_e,id)=>global.__foundationHost.windows.get(id)?.ready===true,id),"Plugin host did not become ready");
    await until(()=>evaluate('!!document.querySelector(".dashboard-snapshot")'),"Overview stayed on Loading Teleno");
    const state=await evaluate('({hidden:document.hidden,text:document.getElementById("mining-panel").innerText,notice:document.getElementById("notice").innerText,node:typeof require})');assert.match(state.text,/Node stopped/);assert.match(state.text,/Set up wallet|Set up a wallet/);assert.equal(state.node,"undefined");report.checks.push("Fresh signed plugin opens its overview through real Core protocol, preload, IPC and native status");report.state=state;report.status="passed";
  }catch(error){report.status="failed";report.error=error.stack;if(app){report.diagnostics=await evaluate('({hidden:document.hidden,ready:document.readyState,text:document.body.innerText,notice:document.getElementById("notice")?.innerText,mining:typeof TelenoMining,app:typeof refresh})').catch(e=>({error:e.message}));report.rendererErrors=await app.evaluate(()=>global.__foundationSmoke.errors).catch(()=>[]);}throw error;
  }finally{report.logs=logs;fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2));if(app){await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});console.log(JSON.stringify(report,null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
