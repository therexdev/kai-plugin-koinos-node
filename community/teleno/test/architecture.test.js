"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {Runtime,PIN,command}=require("../plugin/service/runtime"),{settings}=require("../plugin/service/config");
const hash=data=>crypto.createHash("sha256").update(data).digest("hex");
const version=`teleno_node ${PIN.version}+${PIN.source.slice(0,12)}`;
function root(t){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"kai-teleno-arch-")));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function fixture(t){
  const dir=root(t),native={};
  for(const arch of ["x64","arm64"]){
    const bytes=Buffer.from(`fixture ELF for ${arch}`),folder=path.join(dir,arch,"teleno-node-1.3.0/bin");fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,"teleno_node"),bytes);
    const archive=path.join(dir,arch+".tar.gz");execFileSync("tar",["-czf",archive,"-C",path.join(dir,arch),"teleno-node-1.3.0"]);
    native[arch]={url:`https://github.com/example/runtime/releases/download/test/${arch}.tar.gz`,archiveSha256:hash(fs.readFileSync(archive)),binarySha256:hash(bytes),glibc:arch==="arm64"?"2.36":"2.38",archive,bytes};
  }
  return {...PIN,native};
}
test("platform matrix admits native Linux ARM64 and preserves x64 modes",t=>{
  const runtimePins=fixture(t),dir=root(t);
  for(const [platform,arch,runtime,supported]of [
    ["linux","arm64","native",true],["linux","x64","native",true],
    ["linux","x64","docker",true],["win32","x64","wsl",true],["win32","x64","docker",true],["darwin","x64","docker",true],
    ["linux","arm64","docker",false],["win32","arm64","wsl",false],["darwin","arm64","docker",false],
    ["darwin","arm64","native",false],["linux","arm","native",false],["linux","ia32","native",false],["freebsd","x64","native",false]
  ])assert.equal(new Runtime(dir,{platform,arch,runtimePins}).support({runtime}).supported,supported,`${platform}/${arch}/${runtime}`);
});
test("missing ARM64 pin fails before any download or subprocess; never falls back to x64",async t=>{
  const runtimePins={...PIN,native:{x64:PIN.native.x64}};
  const r=new Runtime(root(t),{platform:"linux",arch:"arm64",runtimePins,fetchImpl:async()=>assert.fail("download"),commandImpl:async()=>assert.fail("command")});
  await assert.rejects(r.install(settings({},"linux")),/verified Linux arm64/);
});
test("32-bit Pi OS receives an actionable error without downloading an incompatible binary",async t=>{
  const r=new Runtime(root(t),{platform:"linux",arch:"arm",fetchImpl:async()=>assert.fail("download")});
  await assert.rejects(r.install(settings({},"linux")),/64-bit Raspberry Pi OS/);
});
for(const arch of ["x64","arm64"])test(`${arch} install uses only its pinned archive and verifies before replacing the engine`,async t=>{
  const runtimePins=fixture(t),pin=runtimePins.native[arch],calls=[],r=new Runtime(root(t),{platform:"linux",arch,runtimePins,
    fetchImpl:async url=>{assert.equal(String(url),pin.url);return new Response(fs.readFileSync(pin.archive));},
    commandImpl:async(file,args,options)=>{calls.push(file);if(file==="tar")return command(file,args,options);assert.equal(hash(fs.readFileSync(file)),pin.binarySha256);return version;}});
  assert.equal(await r.install(settings({},"linux")),version);
  assert.deepEqual(fs.readFileSync(r.binary),pin.bytes);assert.equal(calls.filter(f=>f!=="tar").length,2);assert.ok(calls.every(f=>f!=="docker"&&f!=="wsl.exe"));
  assert.deepEqual(fs.readdirSync(path.dirname(r.binary)),["teleno_node"]);
});
test("an x64 archive supplied to an ARM64 install is rejected and the existing engine is preserved",async t=>{
  const runtimePins=fixture(t),r=new Runtime(root(t),{platform:"linux",arch:"arm64",runtimePins,
    fetchImpl:async()=>new Response(fs.readFileSync(runtimePins.native.x64.archive)),commandImpl:async()=>assert.fail("command")});
  fs.mkdirSync(path.dirname(r.binary));fs.writeFileSync(r.binary,"existing-engine");
  await assert.rejects(r.install(settings({},"linux")),/download checksum/);assert.equal(fs.readFileSync(r.binary,"utf8"),"existing-engine");
  assert.deepEqual(fs.readdirSync(path.dirname(r.binary)),["teleno_node"]);
});
test("the installed x64 engine is refused on ARM64 before execution",async t=>{
  const runtimePins=fixture(t),r=new Runtime(root(t),{platform:"linux",arch:"arm64",runtimePins,commandImpl:async()=>assert.fail("command")});
  fs.mkdirSync(path.dirname(r.binary));fs.writeFileSync(r.binary,runtimePins.native.x64.bytes);
  await assert.rejects(r.installed(settings({},"linux")),/checksum changed/);
});
test("a native loader failure leaves the previous engine and chain data intact",async t=>{
  const runtimePins=fixture(t),r=new Runtime(root(t),{platform:"linux",arch:"arm64",runtimePins,
    fetchImpl:async()=>new Response(fs.readFileSync(runtimePins.native.arm64.archive)),
    commandImpl:async(file,args,options)=>{if(file==="tar")return command(file,args,options);throw Error("GLIBC_2.36 not found");}});
  fs.mkdirSync(path.dirname(r.binary));fs.writeFileSync(r.binary,"previous-engine");
  const s=settings({},"linux");r.prepare(s);const genesis=fs.readFileSync(path.join(r.basedir(s),"chain/genesis_data.json"));
  await assert.rejects(r.install(s),/GLIBC/);assert.equal(fs.readFileSync(r.binary,"utf8"),"previous-engine");assert.deepEqual(fs.readFileSync(path.join(r.basedir(s),"chain/genesis_data.json")),genesis);
});
test("cancellation preserves the old engine and removes download staging",async t=>{
  const runtimePins=fixture(t),cancel=new AbortController(),r=new Runtime(root(t),{platform:"linux",arch:"arm64",runtimePins,
    fetchImpl:async()=>{cancel.abort();return new Response(fs.readFileSync(runtimePins.native.arm64.archive));},commandImpl:async()=>assert.fail("command")});
  fs.mkdirSync(path.dirname(r.binary));fs.writeFileSync(r.binary,"previous-engine");
  await assert.rejects(r.install(settings({},"linux"),cancel.signal),/abort/i);assert.equal(fs.readFileSync(r.binary,"utf8"),"previous-engine");assert.deepEqual(fs.readdirSync(path.dirname(r.binary)),["teleno_node"]);
});
test("an altered or dirty version identity is refused even with a matching hash",async t=>{
  const runtimePins=fixture(t),r=new Runtime(root(t),{platform:"linux",arch:"arm64",runtimePins,commandImpl:async()=>version+"-dirty"});
  fs.mkdirSync(path.dirname(r.binary));fs.writeFileSync(r.binary,runtimePins.native.arm64.bytes);
  await assert.rejects(r.installed(settings({},"linux")),/identity/);
});
