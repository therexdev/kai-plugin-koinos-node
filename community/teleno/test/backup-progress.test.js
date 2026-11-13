"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {EventEmitter}=require("node:events"),{PassThrough}=require("node:stream");
const {BackupProgress}=require("../plugin/service/backup-progress"),{Runtime}=require("../plugin/service/runtime"),{settings}=require("../plugin/service/config");
const view=require("../plugin/backups");
function event(extra={}){return {event:"backup-progress",phase:"public-restore-objects",backup_id:"snapshot-123",completed_bytes:250,total_bytes:1000,completed_batches:1,total_batches:4,attempt:1,...extra};}
const emit=(job,value,channel="stderr")=>job.write(channel,Buffer.from(JSON.stringify(value)+"\n"));
const state=job=>({settings:{network:"mainnet"},runtime:{mode:job.state==="running"?"maintenance":"stopped",job}});
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ui={esc,button:(action,label,kind="",blocked=false)=>`<button data-action="${action}" ${blocked?"disabled":""}>${label}</button>`};
test("native progress survives split UTF-8, chunk boundaries and final lines without a newline",()=>{
  let at=1000;const job=new BackupProgress("public-fetch","mainnet","latest",{now:()=>at});
  const line=Buffer.from(JSON.stringify(event())+"\r\n");for(const piece of [line.subarray(0,13),line.subarray(13,40),line.subarray(40)])job.write("stderr",piece);
  assert.equal(job.data.backupId,"snapshot-123");assert.equal(job.data.progress.completedBytes,250);
  at=3000;emit(job,event({completed_bytes:750,completed_batches:3}));assert.equal(job.data.progress.bytesPerSecond,250);
  const final=Buffer.from(JSON.stringify({backup_id:"snapshot-123",ready_to_stage:true,preflight:{message:"✓ checked"}},null,2));
  for(let i=0;i<final.length;i++)job.write("stdout",final.subarray(i,i+1));job.finish();
  assert.equal(job.data.state,"complete");assert.equal(job.data.result.spaceMessage,"✓ checked");assert.equal(job.data.finishedAt,3000);
});
test("metadata and phase changes never fabricate a percentage or reuse a download speed",()=>{
  let at=1000;const job=new BackupProgress("bootstrap","mainnet","latest",{now:()=>at});
  emit(job,event({phase:"public-restore-metadata-snapshot",completed_bytes:0,total_bytes:0}));assert.equal(view.model(state(job.data),at).percent,null);
  at=2000;emit(job,event());at=4000;emit(job,event({completed_bytes:750}));assert.equal(view.model(state(job.data),at).percent,75);
  at=5000;emit(job,event({phase:"public-restore-stage",completed_bytes:100,total_bytes:2000}));
  const model=view.model(state(job.data),at);assert.equal(model.percent,5);assert.equal(model.speed,null);assert.equal(model.eta,null);assert.match(model.title,/Restoring/);
});
test("a full byte count is verification in progress until the process succeeds",()=>{
  const job=new BackupProgress("public-fetch","mainnet","latest");emit(job,event({completed_bytes:1000,completed_batches:4}));
  const m=view.model(state(job.data));assert.equal(m.active,true);assert.match(m.title,/checking/);assert.equal(m.next,null);
  emit(job,{backup_id:"snapshot-123",ready_to_stage:true},"stdout");job.finish(Error("Teleno exited with code 1"));assert.equal(job.data.state,"failed");assert.equal(view.model(state(job.data)).next,null);
});
test("malformed and out-of-range progress cannot alter the operation or its identity",()=>{
  const job=new BackupProgress("public-fetch","mainnet","latest");emit(job,event());
  const before=structuredClone(job.data);for(const extra of [{completed_bytes:-1},{total_bytes:12},{total_bytes:1e30},{completed_batches:9},{phase:"<script>"},{event:"other"}])emit(job,event(extra));
  job.write("stderr",Buffer.from("{not json}\n"));assert.deepEqual(job.data,before);
  emit(job,event({backup_id:"../../wallet"}));assert.equal(job.data.backupId,"snapshot-123");
});
test("quiet stages hide stale speed estimates and explain that verification can be quiet",()=>{
  let at=1000;const job=new BackupProgress("public-fetch","mainnet","latest",{now:()=>at});emit(job,event());at=3000;emit(job,event({completed_bytes:750}));
  const m=view.model(state(job.data),30000);assert.equal(m.stale,true);assert.equal(m.speed,null);assert.equal(m.eta,null);
  assert.match(view.progress(state(job.data),ui,30000),/Waiting for Teleno/);
});
test("native disk-space refusals show the reason and exact capacity without offering restore",()=>{
  const job=new BackupProgress("public-fetch","mainnet","latest");emit(job,{backup_id:"snapshot-123",ready_to_stage:false,download_skipped_reason:"Insufficient target disk space",preflight:{target_available_bytes:100,target_minimum_free_bytes:200,target_space_passes_minimum:false}},"stdout");job.finish(Error("exited 1"));
  assert.equal(job.data.state,"failed");assert.equal(job.data.result.availableBytes,100);assert.equal(job.data.result.requiredBytes,200);assert.equal(view.model(state(job.data)).title,"Not enough disk space");assert.equal(view.model(state(job.data)).next,null);
});
test("native errors are bounded and redacted; missing result is never a success",()=>{
  const job=new BackupProgress("create","mainnet","latest");job.write("stderr",Buffer.from("Fatal: checkpoint identity unavailable private_key="+"a".repeat(64)));job.finish(Error("exited 1"));
  assert.match(job.data.error,/checkpoint identity/);assert.doesNotMatch(job.data.error,/a{64}/);assert.match(job.data.error,/redacted/);
  const empty=new BackupProgress("public-fetch","mainnet","latest");empty.finish();assert.equal(empty.data.state,"unverified");assert.equal(view.model(state(empty.data)).next,null);
  const large=new BackupProgress("list","mainnet","latest");large.write("stdout",Buffer.alloc(2*1024*1024+1,32));large.finish();assert.equal(large.output.length,0);assert.equal(large.data.state,"unverified");
});
test("cancelled transfers remain distinct from failure and late output cannot change them",()=>{
  const job=new BackupProgress("public-fetch","mainnet","latest");emit(job,event());job.cancel();assert.equal(job.data.state,"cancelling");job.finish(Error("signal SIGTERM"));assert.equal(job.data.state,"cancelled");
  const saved=structuredClone(job.data);emit(job,event({completed_bytes:1000}));job.finish();assert.deepEqual(job.data,saved);assert.equal(view.model(state(job.data)).next,null);
});
test("DNS and missing-file failures explain the action without misreporting disk space",()=>{
  const dns=new BackupProgress("public-list","mainnet","latest");dns.write("stderr",Buffer.from("Fatal: resolve: Host not found [asio.netdb:2 at /build/internal.cpp]"));dns.finish(Error("exited 1"));
  const m=view.model(state(dns.data));assert.equal(m.title,"Cannot reach the snapshot server");assert.doesNotMatch(m.error.detail,/asio|\/build/);
  const missing=new BackupProgress("preflight","mainnet","snapshot-123");emit(missing,{backup_id:"snapshot-123",ready_to_restore:false,missing_object_count:3,space_check:{passes_minimum:true,message:"Target has enough disk space"}},"stdout");missing.finish(Error("exited 1"));
  assert.match(missing.data.error,/missing 3/);assert.notEqual(view.model(state(missing.data)).title,"Not enough disk space");
});
test("snapshot lists and completed downloads expose safe explicit next steps",()=>{
  const list=new BackupProgress("public-list","mainnet","latest");emit(list,{snapshots:[{backup_id:"snapshot-123",complete:true,latest:true,source_created_at:"2026-11-13",source_head_height:41047513,total_bytes:12345},{backup_id:"../../wallet"}]},"stdout");list.finish();
  assert.equal(list.data.result.snapshots.length,1);const html=view.progress(state(list.data),ui);assert.match(html,/Use this snapshot/);assert.match(html,/41,047,513/);assert.doesNotMatch(html,/\.\.\/wallet/);
  const downloaded=new BackupProgress("public-fetch","mainnet","latest");emit(downloaded,{backup_id:"snapshot-123",ready_to_stage:true},"stdout");downloaded.finish();
  assert.deepEqual(view.model(state(downloaded.data)).next,{action:"backup-bootstrap",label:"Restore this snapshot",id:"snapshot-123"});
  assert.equal(view.current({...state(downloaded.data),settings:{network:"harbinger"}}),null);
});
test("final restore result offers only an explicit trip to Overview",()=>{
  const job=new BackupProgress("bootstrap","mainnet","snapshot-123");emit(job,{ok:true,preflight:{backup_id:"snapshot-123"},activation:{backup_id:"snapshot-123",pre_restore_dir:"/node/.pre-restore/old"},stage:{restored_bytes:123}},"stdout");job.finish();
  const m=view.model(state(job.data));assert.equal(m.title,"Snapshot restored");assert.deepEqual(m.next,{action:"go-overview",label:"Go to Overview to start observer"});assert.match(view.progress(state(job.data),ui),/\.pre-restore/);
});
function runtimeFixture(t,platform="linux") {
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"kai-backup-progress-")));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.pid=45678;child.kill=()=>{child.stdout.end();child.stderr.end();child.emit("close",null);};
  const runtime=new Runtime(dir,{platform,arch:"x64",spawnImpl:()=>child});runtime.installed=async()=>"verified fixture";
  if(platform==="win32"){runtime.wsl.idle=async()=>{};runtime.wsl.ready=()=>true;runtime.wsl.paths=()=>({host:path.join(dir,"chains/mainnet"),linux:"/fixture"});runtime.wsl.launch=()=>({file:"wsl.exe",args:[],record:{token:"test",distro:"Ubuntu-24.04",linuxRoot:"/fixture"}});}
  return {runtime,child,options:settings({},platform)};
}
test("runtime routes native stderr progress and stdout results into the status screen",async t=>{
  const {runtime,child,options}=runtimeFixture(t);await runtime.backup(options,"public-fetch","latest");child.stderr.write(JSON.stringify(event())+"\n");
  assert.equal(runtime.snapshot(options).job.progress.completedBytes,250);assert.equal(runtime.mode,"maintenance");
  child.stdout.end(JSON.stringify({backup_id:"snapshot-123",ready_to_stage:true}));child.stderr.end();child.emit("close",0);await runtime.completion;
  assert.equal(runtime.job.state,"complete");assert.equal(runtime.snapshot({...options,network:"harbinger"}).job,null);assert.equal(runtime.child,null);
});
test("successful WSL maintenance drains final output after launcher exit",async t=>{
  const {runtime,child,options}=runtimeFixture(t,"win32");await runtime.backup(options,"list","latest");child.emit("exit",0);assert.equal(runtime.job.state,"running");
  child.stdout.end(JSON.stringify({snapshots:[]}));child.stderr.end();child.emit("close",0);await runtime.completion;assert.equal(runtime.job.state,"complete");assert.deepEqual(runtime.job.result.snapshots,[]);
});
test("Stop reports a cancelled backup only after the child exits",async t=>{
  const {runtime,child,options}=runtimeFixture(t);await runtime.backup(options,"public-fetch","latest");child.stderr.write(JSON.stringify(event())+"\n");
  await runtime.stop(options);assert.equal(runtime.job.state,"cancelled");assert.equal(runtime.child,null);assert.equal(runtime.lastError,null);
});
test("a refused Stop never marks a still-running maintenance process as cancelled",async t=>{
  const {runtime,child,options}=runtimeFixture(t,"win32");runtime.wsl.stop=async()=>{throw Error("Process identity changed");};await runtime.backup(options,"list","latest");
  await assert.rejects(runtime.stop(options),/identity changed/);assert.equal(runtime.job.state,"running");assert.equal(runtime.job.cancelRequested,false);assert.match(runtime.job.stopError,/identity changed/);assert.equal(runtime.child,child);
  child.stdout.end(JSON.stringify({snapshots:[]}));child.stderr.end();child.emit("close",0);await runtime.completion;
});
