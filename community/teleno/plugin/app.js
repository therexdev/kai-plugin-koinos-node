"use strict";
var KaiLocale = globalThis.KaiI18n || (typeof require === "function" ? require("./i18n") : { html: (s, ...v) => typeof s === "string" ? s : s.reduce((a, p, i) => a + p + (v[i] ?? ""), ""), message: (s, ...v) => ({ source: s.reduce((a, p, i) => a + p + (i < v.length ? "{" + i + "}" : ""), ""), values: v }), literal: value => ({ literal: true, value }), setText: (node, v) => { const next = String((v?.literal ? v.value : v?.source?.replace(/\{(\d+)\}/g, (m, i) => v.values[i] ?? m) ?? v) ?? ""); if (node.textContent !== next) node.textContent = next; } });
const $=id=>document.getElementById(id),call=(method,input={})=>window.kai.call(method,input);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const units=s=>{try{const n=BigInt(s),w=n/100000000n,f=(n%100000000n).toString().padStart(8,"0").replace(/0+$/,"");return w.toLocaleString()+ (f?"."+f:"");}catch{return "—";}};
let page="overview",state=null,busy=false,polling=false,lastLogs="",backupSelection="latest",contentReady=false,statusFailed=false;
let setup=null,setupPromise=null,setupChecking=false,setupCheckedAt=0,paintedOverviewKey="";
let production=null,productionPromise=null,productionChecking=false,productionCheckedAt=0,pendingChecking=false,pendingCheckedAt=0;
let mining=null,miningPromise=null,miningCheckedAt=0,miningExpanded=false;
const titles={overview:"Dashboard",setup:"Setup",history:"History",wallet:"Teleno wallet",producer:"Production setup",backups:"Backups & recovery",logs:"Node logs",settings:"Settings",about:"Differences"};
function notice(text,error=false){$("notice").hidden=!text;$("notice").classList.toggle("error",error);$("notice").textContent=text||"";}
function button(action,label,kind="",blocked=false){return `<button data-action="${action}" class="${kind}" data-blocked="${blocked}" ${blocked?"disabled":""} data-i18n="${esc(label)}">${esc(KaiLocale.t(label))}</button>`;}
function syncControls(){document.querySelectorAll("button").forEach(b=>b.disabled=busy||b.dataset.blocked==="true");}
function setupIdentity(){return state?JSON.stringify([state.settings.runtime,state.settings.wslDistro]):"";}
function currentSetup(){return setup?.key===setupIdentity()?setup:null;}
function guideProgress(){return TelenoSetup.progress(state,currentSetup(),production);}
function overviewKey(){return JSON.stringify([setupIdentity(),currentSetup(),setupChecking,production,productionChecking,state?.setup,state?.wallet.address,state?.producer,state?.runtime.mode,state?.runtime.migrationPending,state?.runtime.recoveryPending,state?.head?.recent,state?.head?.advancing,(state?.peers||0)>0,state?.pending]);}
async function checkProduction(force=false){
  if(!state?.wallet.exists||(!force&&state.setup?.goal==="observer"&&page!=="producer"))return;
  if(productionPromise){if(!force)return productionPromise;await productionPromise;}
  const key=TelenoSetup.identity(state);
  if(!force&&production?.key===key&&Date.now()-productionCheckedAt<30000)return;
  productionChecking=true;
  productionPromise=(async()=>{
    try{const value=await call("setup.productionStatus");if(key===TelenoSetup.identity(state))production={...value,key,checkedAt:Date.now()};}
    catch(error){if(key===TelenoSetup.identity(state))production={key,checkedAt:Date.now(),balances:null,registered:null,balancesError:error.message,registrationError:error.message};}
    finally{productionChecking=false;productionCheckedAt=Date.now();productionPromise=null;if((page==="overview"||page==="setup")&&!busy)paint();else if(page==="producer")updateProducerControls();}
  })();return productionPromise;
}
function navigate(next,target){page=next;notice("");paint();if(!contentReady)void refresh(true);if(target)$(target)?.scrollIntoView({block:"start"});else window.scrollTo(0,0);if(page==="overview"||page==="setup"||page==="producer"){void checkSetup();void checkProduction();}}
async function readStatus(){
  let timer;
  try{
    // Bound this read only. Spending and node-control calls retain their
    // existing confirmation journals and cancellation behavior.
    const value=await Promise.race([call("status"),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Teleno did not return its node status within 20 seconds. Retry the connection.")),20000);})]);
    if(!value||!value.settings||!value.wallet||!value.runtime||!value.producer)throw Error("Teleno returned an incomplete node status. Retry the connection.");
    return value;
  }finally{clearTimeout(timer);}
}
function showStartupFailure(error){
  $("content").innerHTML=KaiLocale.html`<section class="card" id="startup-failure" role="status"><h2>Teleno could not load</h2><p>The node status is unavailable. You can retry the connection here.</p><p class="note">${esc(String(error?.message||error).slice(0,500))}</p><div class="actions">${button("retry-status","Retry connection","primary")}</div></section>`;
  bind();syncControls();
}
function transactionStatus(){
  const pending=state.pending,last=state.lastTransaction,tx=pending||last;
  if(!tx)return KaiLocale.html`<p id="pending-tx">No pending transaction.</p>`;
  const title=pending?(pending.state==="included"?"Included · awaiting final confirmation":pending.state==="unavailable"?"Confirmation unavailable":"Pending confirmation"):last.reverted?"Confirmed · execution reverted":"Confirmed";
  const detail=pending?(pending.note||"Confirmation is checked automatically every 15 seconds while the plugin is visible. Your saved transaction will not be submitted again."):(last.reverted?"The transaction was included but its execution reverted.":"Verified on the canonical chain and irreversibly confirmed.");
  return KaiLocale.html`<p class="${!pending&&!last.reverted?"status":""}" id="pending-tx"><strong>${esc(title)}</strong></p><code class="transaction-id">${esc(tx.txId)}</code><p>${esc(detail)}${last&&!pending&&last.blockHeight?" Block "+esc(last.blockHeight)+".":""}</p>${pending?button("pending","Check pending transaction","",pendingChecking):""}`;
}
function updateTransaction(){if($("transaction-status")){$("transaction-status").innerHTML=transactionStatus();bind();syncControls();}}
async function checkPending(){
  if(!state?.pending||busy||pendingChecking||Date.now()-pendingCheckedAt<15000)return;
  pendingChecking=true;
  try{const result=await call("wallet.pending");state=await call("status");if((page==="overview"||page==="setup")&&!busy)paint();else updateTransaction();if(!result.pending){production=null;if(page==="wallet")void loadWallet(false,true);if(page==="overview"||page==="setup"||page==="producer")void checkProduction(true);}}
  catch(error){if(state?.pending)state.pending={...state.pending,state:"unavailable",note:"Confirmation check failed: "+error.message+". Your transaction remains saved; it will be checked again."};}
  finally{pendingChecking=false;pendingCheckedAt=Date.now();if(page==="wallet")updateTransaction();if(page==="producer")updateProducerControls();}
}
function updateProducerControls(){
  if(page!=="producer"||!state)return;
  const g=guideProgress();
  for(const [action,blocked] of [["key",g.walletCreationBlocked||!g.runtimeReady||!g.storageReady||g.keyReady],["register",!g.canRegister],["produce",!g.canProduce],["stop",!g.locked]]){
    const b=document.querySelector(`[data-action="${action}"]`);if(b)b.dataset.blocked=String(blocked);
  }
  if($("producer-registration"))$("producer-registration").textContent=g.registered?"The signing key matches the on-chain registration.":productionChecking?"Checking registration…":g.evidence?.registrationError?"Registration could not be verified: "+g.evidence.registrationError:"Registration is not verified yet. Use Check registration.";
  if($("producer-readiness"))$("producer-readiness").textContent=state.pending?"Wait for the pending transaction to be irreversibly confirmed.":!g.runtimeReady?"Complete runtime setup in Setup first.":!g.synced?"Start an observer and wait for a recent, advancing head and connected peers.":!g.funded?"VHP balance has not been verified. Check progress in Setup.":!g.registered?"Register this signing key and verify that registration.":"Observer, VHP and signing-key registration are ready for review.";
  syncControls();
}
async function checkSetup(force=false){
  if(!state)return;
  if(setupPromise){if(!force)return setupPromise;await setupPromise;}
  const previous=currentSetup();
  if(!force&&previous&&(previous.runtimeReady||Date.now()-setupCheckedAt<15000))return;
  const key=setupIdentity();setupChecking=true;
  if((page==="overview"||page==="setup")&&!busy)paint();
  setupPromise=(async()=>{
    try{const value=await call("runtime.setupStatus");if(key===setupIdentity())setup={...value,key};}
    catch(error){if(key===setupIdentity())setup={key,wslReady:false,runtimeReady:false,message:error.message};}
    finally{setupChecking=false;setupCheckedAt=Date.now();setupPromise=null;if((page==="overview"||page==="setup")&&!busy)paint();}
  })();return setupPromise;
}
function jobStatus(job){
  if(!job)return "No maintenance job running.";
  if(job.state==="failed")return "Operation stopped: "+(job.error||"See Logs for details.");
  if(job.state==="complete")return "Operation complete.";
  if(job.action==="switch-to-wsl"&&job.totalBytes)return `Copying node data: ${Math.round(100*job.copiedBytes/job.totalBytes)}% verified`;
  return job.action==="switch-to-wsl"?"Preparing Linux node storage…":"Native backup operation is running…";
}
function updateBackups(){
  if(page!=="backups"||!$("backup-progress"))return;
  const detailsOpen=$("backup-details")?.open;
  $("backup-progress").innerHTML=TelenoBackups.progress(state,{button,esc});
  if(detailsOpen&&$("backup-details"))$("backup-details").open=true;
  document.querySelectorAll("[data-action^='backup-']").forEach(b=>b.dataset.blocked=String(TelenoBackups.locked(state)));
  bind();syncControls();
}
function password(id="password"){return KaiLocale.html`<label>Wallet password<input type="password" id="${id}" autocomplete="current-password" maxlength="256"></label>`;}
function miningIdentity(){return JSON.stringify([state?.wallet.address,state?.settings.network]);}
function drawMining(){const host=$("mining-panel");if(host&&state){const focused=host.contains(document.activeElement)?document.activeElement.dataset.action:null;host.innerHTML=(page==="overview"?TelenoDashboard.render(state,mining,{esc,units,button,progress:guideProgress()}):TelenoMining.render(state,mining,{esc,units,button,expanded:miningExpanded}));bind();syncControls();if(focused)host.querySelector(`[data-action="${focused}"]`)?.focus({preventScroll:true});}}
async function loadMining(force=false){
  if(!["overview","history"].includes(page)||!state||miningPromise)return;
  const key=miningIdentity();
  if(mining?.key!==key){mining=null;miningCheckedAt=0;miningExpanded=false;drawMining();}
  if(!force&&Date.now()-miningCheckedAt<30000)return;
  miningCheckedAt=Date.now();
  miningPromise=(async()=>{
    try{const result=await call("dashboard.summary");if(key!==miningIdentity())return;if(result.address!==state.wallet.address||result.network!==state.settings.network)throw Error("Mining details did not match the selected wallet and network.");
      mining={...result,key,mining:result.mining||mining?.mining||null,stale:!!result.miningError};}
    catch(error){if(key===miningIdentity())mining={...(mining||{}),key,address:state.wallet.address,network:state.settings.network,error:error.message};}
    finally{miningPromise=null;if(["overview","history"].includes(page)&&!busy)drawMining();}
  })();return miningPromise;
}
function overview(){return `<div id="mining-panel">${TelenoDashboard.render(state,mining,{esc,units,button,progress:guideProgress()})}</div>`;}
function setupPage(){return TelenoStorage.render(state,{esc,button})+KaiLocale.html`<section class="card setup-launch"><div><h2>Download the chain faster</h2><p>Optional: download and verify the latest public snapshot, then start the observer. Wallet setup can continue while it syncs.</p></div>${button("quick-bootstrap","Download latest chain","",guideProgress().locked||!guideProgress().runtimeReady||!guideProgress().storageReady)}</section>`+TelenoBackups.progress(state,{button,esc})+TelenoGuide.render(state,currentSetup(),production,{button,esc,units,checking:setupChecking,productionChecking});}

function paint(){
  if(!state){$("content").innerHTML=KaiLocale.html('<div class="card">Loading Teleno…</div>');return;}
  const openDetails=[...document.querySelectorAll("details[id][open]")].map(d=>d.id);
  const {settings:s,wallet:w,runtime:r}=state,g=guideProgress();KaiLocale.setText($("title"), titles[page]);KaiLocale.setText($("network"), (s.network==="mainnet" ? KaiLocale.message(["Mainnet"]) : KaiLocale.message(["Harbinger testnet"])));
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("selected",b.dataset.page===page||page==="producer"&&b.dataset.page==="setup"));
  let html="";
  if(page==="overview"){html=overview();paintedOverviewKey=overviewKey();}
  if(page==="wallet")html=TelenoWallet.render(state,{esc,units,button});
  if(page==="setup")html=setupPage();
  if(page==="history")html=`<div id="mining-panel">${TelenoMining.render(state,mining,{esc,units,button,expanded:miningExpanded})}</div>`;
  if(page==="producer")html=KaiLocale.html`<div class="page-guide-link">${button("go-overview","Back to Setup")}</div><section class="card"><h2>Enable block production deliberately</h2><p>Create and back up your Teleno wallet, start an observer and let it sync while creating its separate signing key. Then fund the wallet, get VHP, register the key, and wait for confirmation before enabling production.</p><p class="note">This earns Koinos block rewards. It does not provide AI capacity or distribute the KAI reward pool. Wallet locking does not stop an already running producer. Restarting KAI starts only an observer when enabled in Settings.</p><h3>Producer wallet</h3><div class="address">${esc(w.address||"Create a Teleno wallet first.")}</div><h3>Block-signing public key</h3><code id="producer-key">${esc(state.producer.publicKey||"Not created")}</code><p id="producer-registration" class="muted">Registration not checked yet.</p><div class="actions">${button("key","Create block-signing key")}${button("producer-check","Check registration")}</div><p id="producer-readiness" class="note"></p>${password("producer-password")}<div class="actions">${button("register","Review key registration")}${button("produce","Enable production","primary")}${button("stop","Stop node","danger")}</div><p>Registration and enabling production are separate reviewed actions. Teleno stores the hot block-signing key in its own node folder; the encrypted spending key is never placed there.</p></section>`;
  if(page==="backups")html=TelenoBackups.render(state,{button,esc},backupSelection);
  if(page==="logs")html=KaiLocale.html`<section class="card"><h2>Teleno runtime output</h2><p>Wallet passwords and signing keys are redacted. The log is bounded and refreshes while this page is open.</p><pre id="logs">${esc(lastLogs||"Loading logs…")}</pre>${button("copy-logs","Copy logs")}</section>`;
  if(page==="settings")html=KaiLocale.html`<section class="card"><h2>Node settings</h2><p>Stop Teleno before changing settings. Each network keeps its own chain database and producer key. Wallet funds remain on their original network.</p><form id="settings-form"><div class="grid two"><label>Network<select id="setting-network"><option value="mainnet">Mainnet</option><option value="harbinger">Harbinger testnet</option></select></label><label>Runtime<select id="setting-runtime"><option value="wsl">Windows · Native through WSL2 (no Docker)</option><option value="native">Native Linux (x64 / ARM64)</option><option value="docker">Docker · x64 Linux container</option></select></label><label>WSL distribution (Windows)<input id="setting-wsl" maxlength="64" value="${esc(s.wslDistro)}" pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" required></label><label>Local RPC port<input id="setting-rpc" type="number" min="1024" max="65535" value="${s.rpcPort}" required></label><label>P2P port<input id="setting-p2p" type="number" min="1024" max="65535" value="${s.p2pPort}" required></label><label>Local gRPC port<input id="setting-grpc-port" type="number" min="1024" max="65535" value="${s.grpcPort}" required></label></div><label class="toggle"><input id="setting-grpc" type="checkbox" ${s.grpc?"checked":""}>Enable local gRPC</label><label>Log level<select id="setting-log"><option>info</option><option>debug</option><option>warn</option><option>error</option></select></label><label class="toggle"><input id="setting-history" type="checkbox" ${s.history?"checked":""}>Local transaction and account history</label><label class="toggle"><input id="setting-autostart" type="checkbox" ${s.autoStart?"checked":""}>Start an observer when KAI opens</label><p>JSON-RPC and optional gRPC stay on localhost. Backup administration endpoints stay off. Starting with KAI never enables production. No automatic burns, transfers, or key registration.</p><button class="primary">Save settings</button></form></section>`;
  if(page==="about")html=KaiLocale.html`<section class="card hero"><span class="badge">Community</span><h2 style="margin-top:16px">An alternative Koinos implementation</h2><p>Teleno is an independent Koinos-compatible node from the koinos/teleno project. This KAI integration is maintained by therexdev; it is not an upstream endorsement.</p></section><section class="card"><table><thead><tr><th>Feature</th><th>Teleno Community</th><th>Regular KAI Koinos Node</th></tr></thead><tbody><tr><td>Runtime</td><td>One native process or one container</td><td>Docker microservice stack</td></tr><tr><td>Wallet</td><td>Own encrypted Teleno wallet</td><td>Own encrypted Node wallet</td></tr><tr><td>Platforms</td><td>Linux x64 and ARM64 native; Windows x64 through WSL2 without Docker. Docker remains an optional x64 runtime.</td><td>Docker-based setup</td></tr><tr><td>Node modes</td><td>Observer and reviewed producer activation</td><td>Managed Koinos block producer</td></tr><tr><td>Backups</td><td>Native Teleno snapshots and public bootstrap</td><td>Legacy node quick sync and migration</td></tr><tr><td>Funding</td><td>Receive / send KOIN and VHP; manual burn</td><td>Bridge and external funding flows</td></tr><tr><td>Automation</td><td>Optional observer startup</td><td>Recovery and reward automation</td></tr><tr><td>Pi / ARM</td><td>Native Linux ARM64; requires 64-bit Raspberry Pi OS</td><td>Separate platform support</td></tr></tbody></table><p>Teleno 1.3.0 has published observer qualification. Long-term loaded mainnet producer and broader resource gates remain upstream work. This integration does not guarantee earnings or continuous production.</p><p>Native plugin installation grants full application/computer trust. Separate folders prevent accidental mixing; they are not a security sandbox.</p><div class="actions">${button("upstream","Upstream project")}${button("release","Pinned release notes")}${button("manual","Full upstream manual")}${button("wsl","WSL2 setup guide")}${button("docker","Docker installation guide")}</div></section>`;
  $("content").innerHTML=html;for(const id of openDetails){if($(id)?.tagName==="DETAILS")$(id).open=true;}
  if(page==="settings")$("content").insertAdjacentHTML("afterbegin",TelenoStorage.render(state,{esc,button}));
  if(page==="settings"){ $("setting-network").value=s.network;$("setting-runtime").value=s.runtime;$("setting-log").value=s.logLevel; }
  bind();syncControls();if(page==="overview"||page==="history")void loadMining();if(page==="wallet")initWallet();if(page==="logs")loadLogs();if(page==="producer"){updateProducerControls();void checkProduction();}
  contentReady=true;
}
async function run(fn,checkAfter=false,productionAfter=false){if(busy)return;busy=true;notice("Working…");syncControls();try{const result=await fn();state=await call("status");if(checkAfter)await checkSetup(true);if(productionAfter)await checkProduction(true);if(page==="backups"&&(result?.category==="backup"||result?.job?.category==="backup"))notice("");else notice(typeof result==="string"?result:result?.note||result?.txId?`${result.note||(result.confirmed?(result.reverted?"Transaction reverted.":"Transaction confirmed."):"Transaction submitted.")}${result.txId?"\n"+result.txId:""}`:"Done.");paint();}catch(e){notice(e.message,true);if(page==="backups"){try{state=await call("status");updateBackups();}catch{}}if(checkAfter){try{state=await call("status");await checkSetup(true);paint();}catch{}}}finally{busy=false;syncControls();}}
function bind(){
  if($("backup-id"))$("backup-id").oninput=()=>{backupSelection=$("backup-id").value;};
  document.querySelectorAll("[data-backup-select]").forEach(b=>b.onclick=()=>{backupSelection=b.dataset.backupSelect;if($("backup-id")){$("backup-id").value=backupSelection;$("backup-id").focus();}notice("Snapshot selected. Choose Download public snapshot, or Check restore for a local snapshot.");});
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{
    if(b.dataset.action==="retry-status"){void refresh(true);return;}
    const destinations={"go-overview":["setup"],"go-setup":["setup"],"go-history":["history"],"go-storage":["settings","chain-storage"],"go-wallet":["wallet"],"go-backup":["wallet","wallet-backup-panel"],"go-fund":["wallet","wallet-fund-panel"],"go-producer":["producer"],"go-logs":["logs"],"go-backups":["backups"],"go-settings":["settings"]};
    if(destinations[b.dataset.action]){navigate(...destinations[b.dataset.action]);if(b.dataset.action==="go-backup"&&state.wallet.exists)walletUI.action("wallet-backup");return;}
    if(b.dataset.action.startsWith("wallet-"))return walletUI.action(b.dataset.action);
    if(b.dataset.action==="mining-refresh"){void loadMining(true);return;}
    if(b.dataset.action==="mining-history"){miningExpanded=!miningExpanded;drawMining();return;}
    return run(async()=>{
    const action=b.dataset.action;
    if(action==="storage-choose")return call("storage.choose");if(action==="storage-resume")return call("storage.resume");if(action==="storage-cancel")return call("storage.cancel");if(action==="storage-original")return call("storage.keepOriginal");if(action==="quick-bootstrap")return call("backup.run",{action:"bootstrap",id:"latest"});
    if(action==="goal-producer"||action==="goal-observer")return call("setup.goal",{goal:action.slice(5)});
    if(action==="check-progress"||action==="producer-check")return {note:"Progress checked. Follow the next available setup step."};
    if(action==="check-setup")return {note:"Setup checked. Follow the next available step below."};
    if(["upstream","release","docker","wsl","manual"].includes(action))return call("util.open",{page:action});
    if(action==="setup-wsl")return call("runtime.setupWsl");if(action==="use-wsl")return call("runtime.useWsl");
    if(action==="install")return call("runtime.install");if(action==="start"){const result=await call("node.start");page="overview";return result;}if(action==="stop")return call("node.stop");
    if(action==="copy-address")return call("util.copy",{text:state.wallet.address});if(action==="copy-logs")return call("util.copy",{text:lastLogs});
    if(action==="lock")return call("wallet.lock");if(action==="unlock"||action==="backup-wallet"){const password=$("password").value;$("password").value="";return call(action==="unlock"?"wallet.unlock":"wallet.backup",{password});}
    if(action==="pending")return call("wallet.pending");if(action==="key")return call("producer.key");if(action==="produce"){const result=await call("producer.start");page="overview";return result;}
    if(action==="register"){const password=$("producer-password").value;$("producer-password").value="";return call("producer.register",{password});}
    if(action.startsWith("backup-"))return call("backup.run",{action:action.slice(7),id:b.dataset.snapshotId||backupSelection.trim()||"latest"});
  },["setup-wsl","check-setup","use-wsl","install"].includes(b.dataset.action),["key","register","produce","pending","check-progress","producer-check","goal-producer","use-wsl","install","start","stop"].includes(b.dataset.action));});
  document.querySelectorAll(".setup-goal button").forEach(b=>b.setAttribute("aria-pressed",String(b.classList.contains("selected"))));
  const form=(id,fn)=>{if($(id))$(id).onsubmit=e=>{e.preventDefault();run(fn);};};
  form("settings-form",()=>call("settings.save",{network:$("setting-network").value,runtime:$("setting-runtime").value,wslDistro:$("setting-wsl").value.trim(),grpc:$("setting-grpc").checked,grpcPort:Number($("setting-grpc-port").value),rpcPort:Number($("setting-rpc").value),p2pPort:Number($("setting-p2p").value),logLevel:$("setting-log").value,history:$("setting-history").checked,autoStart:$("setting-autostart").checked}));
}
const walletUI=TelenoWalletController.create({getState:()=>state,getPage:()=>page,call,run,paint,notice,units,updateTransaction});
function initWallet(){walletUI.init();}
async function loadWallet(older=false,force=false){return walletUI.load(older,force);}

async function loadLogs(){try{lastLogs=await call("logs");if($("logs"))$("logs").textContent=lastLogs;}catch(e){notice(e.message,true);}}
document.querySelectorAll("nav [data-page]").forEach(b=>b.onclick=()=>navigate(b.dataset.page));
async function refresh(force=false){if(polling||contentReady&&document.hidden&&!force)return;polling=true;try{state=await readStatus();if(statusFailed){notice("");statusFailed=false;}if(!contentReady||(!busy&&page==="overview"&&paintedOverviewKey!==overviewKey()))paint();if($("live-mode"))$("live-mode").textContent=state.runtime.mode;if($("live-head"))$("live-head").textContent=state.head?.height?.toLocaleString()||"—";if($("live-peers"))$("live-peers").textContent=state.peers??"—";if($("live-rpc"))KaiLocale.setText($("live-rpc"), ((_value) => _value ? KaiLocale.literal(_value) : KaiLocale.message(["Observer mode does not spend funds or produce blocks."]))(state.rpcError||state.runtime.error));if(page==="setup"&&!busy)paint();if(page==="overview"||page==="history"){drawMining();if(!busy)void loadMining();}if(page==="backups")updateBackups();if($("migration-status"))$("migration-status").textContent=state.runtime.job?.action==="switch-to-wsl"?jobStatus(state.runtime.job):"";if(page==="logs")await loadLogs();if(!busy&&(page==="overview"||page==="setup"||page==="producer")){void checkSetup();void checkProduction();}if(!busy)void checkPending();if(page==="wallet"&&!busy)walletUI.tick();if(page==="producer")updateProducerControls();}catch(e){statusFailed=true;if(!contentReady)showStartupFailure(e);else{state={...state,rpcError:"Node status could not refresh: "+e.message};notice(state.rpcError,true);if(page==="overview")drawMining();}}finally{polling=false;}}
window.addEventListener("focus",()=>{void refresh(true);if(!busy&&(page==="overview"||page==="setup"||page==="producer")){void checkSetup();void checkProduction();}if(!busy)void checkPending();if(page==="producer")updateProducerControls();});
document.addEventListener("visibilitychange",()=>{if(document.hidden)walletUI.clearSecrets();if(!document.hidden)void refresh(true);});
paint();void refresh();setInterval(refresh,5000);

setInterval(()=>{if(page!=="overview")return;const now=new Date();if($("dashboard-time"))$("dashboard-time").textContent=now.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});if($("dashboard-date"))$("dashboard-date").textContent=now.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});},1000);
