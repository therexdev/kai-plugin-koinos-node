"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {Runtime:NativeRuntime,PIN}=require("../plugin/service/runtime"),{settings:validateSettings,generate}=require("../plugin/service/config");
const settings=input=>validateSettings(input,"linux");
class Runtime extends NativeRuntime { constructor(root,deps={}) { super(root,{platform:"linux",arch:"x64",...deps}); } }
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"kai-teleno-runtime-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return fs.realpathSync(dir);}
test("Docker uses an immutable image, exclusive name and localhost RPC; never mounts wallet",t=>{
  const runtime=new Runtime(root(t)),s=settings({runtime:"docker"}),spec=runtime.launchArgs(s,["--disable","block_producer","grpc"]);
  assert.equal(spec.file,"docker");assert.ok(spec.args.includes(PIN.image));assert.ok(spec.args.includes("127.0.0.1:18085:18085"));assert.ok(spec.args.includes("18890:18890"));
  const mount=spec.args[spec.args.indexOf("--mount")+1];assert.match(mount,/chains[\\/]mainnet,target=\/data$/);assert.doesNotMatch(mount,/wallet/);assert.ok(spec.args.includes("kai.teleno.owner="+runtime.owner));
});
test("observer configs keep production and admin off and bind native RPC only on localhost",t=>{
  const dir=root(t);for(const network of ["mainnet","harbinger"]){const s=settings({network}),text=generate(s,dir);assert.match(text,/block_producer: false/);assert.match(text,/grpc: false/);assert.match(text,/listen: 127.0.0.1:18085/);assert.doesNotMatch(text,/private-key-file|admin:/);assert.match(text,/verify-blocks: true/);}
});
test("configuration never overwrites mismatched genesis",t=>{
  const runtime=new Runtime(root(t)),s=settings({});const dir=runtime.prepare(s);fs.writeFileSync(path.join(dir,"chain/genesis_data.json"),"other-chain");assert.throws(()=>runtime.prepare(s),/differs/);assert.equal(fs.readFileSync(path.join(dir,"chain/genesis_data.json"),"utf8"),"other-chain");
});
test("unsupported architecture is explicit and install executes no process",async t=>{
  let called=false;const runtime=new Runtime(root(t),{arch:"arm64",commandImpl:async()=>{called=true;}});await assert.rejects(runtime.install(settings({})),/x64/);assert.equal(called,false);
});
test("checksum mismatch prevents executable launch",async t=>{
  let called=false;const runtime=new Runtime(root(t),{commandImpl:async()=>{called=true;}});fs.mkdirSync(path.dirname(runtime.binary));fs.writeFileSync(runtime.binary,"altered");await assert.rejects(runtime.installed(settings({})),/checksum/);assert.equal(called,false);
});
test("stopping Docker refuses another plugin's container",async t=>{
  const calls=[],runtime=new Runtime(root(t),{commandImpl:async(file,args)=>{calls.push(args);return JSON.stringify([{Config:{Labels:{"kai.teleno.owner":"another-owner"}},Mounts:[]}]);}});
  runtime.localDocker=async()=>{};runtime.child={};
  await assert.rejects(runtime.stop(settings({runtime:"docker"})),/ownership/);assert.equal(calls.length,1);
});
test("remote Docker contexts are refused before starting containers",async t=>{
  const calls=[],runtime=new Runtime(root(t),{commandImpl:async(file,args)=>{calls.push(args);return JSON.stringify([{Endpoints:{docker:{Host:"ssh://remote-host"}}}]);}});
  await assert.rejects(runtime.installed(settings({runtime:"docker"})),/local Docker/);assert.equal(calls.length,1);
});
test("stale process record blocks configuration writes until owned recovery",t=>{
  const dir=root(t),runtime=new Runtime(dir);fs.writeFileSync(path.join(dir,"process.json"),JSON.stringify({pid:999999}));assert.throws(()=>runtime.idle(),/previous Teleno/);
});
test("backup command refuses arbitrary CLI options as a snapshot ID",async t=>{
  const runtime=new Runtime(root(t));runtime.installed=async()=>"test";await assert.rejects(runtime.backup(settings({}),"restore","--enable=block_producer"),/Invalid backup ID/);
});
test("symlinked wallet and chain paths are rejected",{skip:process.platform==="win32"},t=>{
  const dir=root(t),elsewhere=root(t);fs.symlinkSync(elsewhere,path.join(dir,"chains"));const runtime=new Runtime(dir);assert.throws(()=>runtime.prepare(settings({})),/unsafe/);
});
