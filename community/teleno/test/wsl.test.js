"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {settings,generate}=require("../plugin/service/config"),{Runtime,decode}=require("../plugin/service/runtime");
const {distributions,hostPath,WslRuntime}=require("../plugin/service/wsl"),{copyChains}=require("../plugin/service/wsl-migration");
const {create}=require("../plugin/service");
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"kai-wsl-test-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return fs.realpathSync(dir);}
test("Windows defaults to WSL without changing explicitly saved Docker settings",()=>{
  assert.equal(settings({},"win32").runtime,"wsl");assert.equal(settings({runtime:"docker"},"win32").runtime,"docker");
  assert.equal(settings({},"linux").runtime,"native");
  for(const wslDistro of ["docker-desktop","docker-desktop-data","../Ubuntu","Ubuntu;calc","Ubuntu\n24","-exec"])
    assert.throws(()=>settings({wslDistro},"win32"),/Invalid/);
});
test("WSL decodes localized UTF16 listings and excludes Docker distributions",()=>{
  const data="\uFEFF  NAME           ETAT       VERSION\r\n* Ubuntu-24.04    Arrêté     2\r\n  Debian          Running    1\r\n  docker-desktop  Running    2\r\n";
  assert.deepEqual(distributions(decode(Buffer.from(data,"utf16le"))),[{name:"Ubuntu-24.04",version:2},{name:"Debian",version:1}]);
  assert.equal(hostPath("Ubuntu-24.04","/home/alice/node data"),"\\\\wsl.localhost\\Ubuntu-24.04\\home\\alice\\node data");
  assert.throws(()=>hostPath("Ubuntu-24.04","/home/../etc"));
});
test("WSL1 and missing Linux distributions give setup errors without invoking Docker",async t=>{
  for(const listing of ["Ubuntu-24.04 Stopped 1", "docker-desktop Running 2"]){
    const calls=[],wsl=new WslRuntime(root(t),{owner:"test-owner",command:async(file,args)=>{calls.push([file,args]);return listing;}});
    await assert.rejects(wsl.check(settings({},"win32")),/WSL1|not installed/);
    assert.equal(calls.length,1);assert.equal(calls[0][0],"wsl.exe");
  }
});
test("native WSL settings generate Linux paths and optional loopback gRPC",()=>{
  const options=settings({grpc:true},"win32"),config=generate(options,"/home/alice/.local/share/kai-teleno/profile/chains/mainnet");
  assert.match(config,/listen: 127\.0\.0\.1:18085/);assert.match(config,/listen: 127\.0\.0\.1:18086/);
  assert.match(config,/grpc: true/);assert.match(config,/block_producer: false/);assert.doesNotMatch(config,/\\\\wsl|C:|0\.0\.0\.0:1808/);
  assert.throws(()=>settings({grpc:true,grpcPort:18085},"win32"),/different/);
});
test("fresh Windows status and shutdown do not need Docker or an initialized WSL distribution",async t=>{
  const dir=root(t),controller=new AbortController();const service=create({version:1,plugin:{id:"community.teleno-node",dataDir:dir},signal:controller.signal,desktop:{confirm:async()=>true}},
    {platform:"win32",electron:{},runtime:new Runtime(dir,{platform:"win32",commandImpl:async()=>{throw Error("No command should run");}})});
  const status=await service.call("status");assert.equal(status.settings.runtime,"wsl");assert.equal(status.producer.exists,false);assert.equal(status.runtime.storageReady,false);
  await service.dispose();
});
test("upgrade recognizes old unsaved Windows chain data rather than hiding its key",async t=>{
  const dir=root(t);fs.mkdirSync(path.join(dir,"chains"));const controller=new AbortController();
  const service=create({version:1,plugin:{id:"community.teleno-node",dataDir:dir},signal:controller.signal,desktop:{confirm:async()=>true}},{platform:"win32",electron:{}});
  assert.equal((await service.call("status")).settings.runtime,"docker");await service.dispose();
});
test("migration preserves original keys and databases, verifies resume, and rejects source changes",async t=>{
  const dir=root(t),source=path.join(dir,"source"),destination=path.join(dir,"destination"),journal=path.join(dir,"migration.json");
  fs.mkdirSync(path.join(source,"mainnet/block_producer"),{recursive:true});fs.writeFileSync(path.join(source,"mainnet/block_producer/private.key"),"fixture-key");
  fs.mkdirSync(path.join(source,"mainnet/db"));fs.writeFileSync(path.join(source,"mainnet/db/fixture"),"chain-data");
  const input={source,destination,journal,identity:{owner:"fixture",distro:"Ubuntu-24.04"}};
  const first=await copyChains(input);assert.equal(first.files,2);assert.equal(fs.readFileSync(path.join(source,"mainnet/block_producer/private.key"),"utf8"),"fixture-key");
  assert.deepEqual(await copyChains(input),first);
  fs.writeFileSync(path.join(source,"mainnet/db/fixture"),"changed-data");await assert.rejects(copyChains(input),/changed/);
  assert.equal(fs.readFileSync(path.join(destination,"mainnet/db/fixture"),"utf8"),"chain-data");
});
test("migration refuses an unrelated destination and cancellation preserves the source",async t=>{
  const dir=root(t),source=path.join(dir,"source"),destination=path.join(dir,"destination"),journal=path.join(dir,"migration.json");
  fs.mkdirSync(source);fs.mkdirSync(destination);fs.writeFileSync(path.join(destination,"existing"),"keep");
  await assert.rejects(copyChains({source,destination,journal,identity:{}}),/already contains/);assert.equal(fs.readFileSync(path.join(destination,"existing"),"utf8"),"keep");
  const cancel=new AbortController();cancel.abort();await assert.rejects(copyChains({source,destination,journal,identity:{},signal:cancel.signal}),/abort/i);
});
test("interrupted multi-file copy resumes its verified files without deleting originals",async t=>{
  const dir=root(t),source=path.join(dir,"source"),destination=path.join(dir,"destination"),journal=path.join(dir,"migration.json");fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,"a"),Buffer.alloc(65536,1));fs.writeFileSync(path.join(source,"b"),Buffer.alloc(65536,2));
  const cancel=new AbortController(),input={source,destination,journal,identity:{owner:"resume",distro:"Ubuntu-24.04"}};
  await assert.rejects(copyChains({...input,signal:cancel.signal,progress:()=>cancel.abort()}),/abort/i);
  assert.ok(fs.existsSync(journal));assert.ok(fs.existsSync(path.join(destination,"a")));assert.ok(!fs.existsSync(path.join(destination,"b")));
  assert.equal((await copyChains(input)).files,2);assert.deepEqual(fs.readFileSync(path.join(destination,"b")),fs.readFileSync(path.join(source,"b")));
});
test("public bootstrap passes the selected snapshot to the complete upstream runtime",async t=>{
  const r=new Runtime(root(t),{platform:"linux",arch:"x64"}),s=settings({},"linux");let actual;
  r.installed=async()=>"pinned runtime";r.launch=(_s,args)=>{actual=args;return Promise.resolve();};
  await r.backup(s,"bootstrap","snapshot-123");assert.deepEqual(actual,["--backup-public-restore","--backup-json","--backup-id","snapshot-123"]);
});
test("WSL failure retains the host recovery record and uses only the WSL launcher",async t=>{
  const {EventEmitter}=require("node:events"),{PassThrough}=require("node:stream");const dir=root(t),calls=[];
  const child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();
  const r=new Runtime(dir,{platform:"win32",spawnImpl:(file,args)=>{calls.push({file,args});return child;}});
  r.wsl.launch=()=>({file:"wsl.exe",args:["fixture"],record:{token:"test-token",distro:"Ubuntu-24.04",linuxRoot:"/tmp/test"}});
  // stdout is intentionally still open: close will not fire for an orphan.
  const done=r.launch(settings({},"win32"),["--disable","block_producer"],"observer");child.emit("exit",1);
  await assert.rejects(done,/exited/);assert.ok(fs.existsSync(path.join(dir,"process.json")));assert.equal(calls[0].file,"wsl.exe");
});
