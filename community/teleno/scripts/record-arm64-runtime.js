"use strict";
// Author-time only. Record a Linux ARM64 build for qualification before review
// and inclusion in the signed plugin. This does not publish or sign anything.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict"),{execFileSync}=require("node:child_process");
const PIN=require("../plugin/service/runtime.json");
const [binary,archive,output]=process.argv.slice(2);
assert.ok(binary&&archive&&output,"Usage: node scripts/record-arm64-runtime.js <binary> <archive.tar.gz> <output.json>");
const elf=fs.readFileSync(binary),bytes=fs.readFileSync(archive),hash=data=>crypto.createHash("sha256").update(data).digest("hex");
assert.equal(elf.subarray(0,6).toString("hex"),"7f454c460201","Expected a little-endian ELF64");
assert.equal(elf.readUInt16LE(18),183,"Expected an AArch64 engine, never an Android/x64 substitute");
const sections=execFileSync("readelf",["-l",binary],{encoding:"utf8"});
assert.match(sections,/\/lib\/ld-linux-aarch64\.so\.1/,"Expected Linux GLIBC ARM64, not an Android engine");
const symbols=execFileSync("readelf",["--version-info",binary],{encoding:"utf8"});
const compare=(a,b)=>{const aa=a.split('.').map(Number),bb=b.split('.').map(Number);for(let i=0;i<Math.max(aa.length,bb.length);i++){const delta=(aa[i]||0)-(bb[i]||0);if(delta)return delta;}return 0;};
for(const [name,max] of [["GLIBC","2.36"],["GLIBCXX","3.4.30"]]){
  const versions=[...symbols.matchAll(new RegExp(`\\b${name}_([0-9]+(?:\\.[0-9]+)+)`,"g"))].map(m=>m[1]).sort(compare);
  assert.ok(versions.length&&compare(versions.at(-1),max)<=0,`${name} exceeds Debian 12 / Pi OS Bookworm baseline: ${versions.at(-1)}`);
}
const version=execFileSync(binary,["--version"],{encoding:"utf8"}).trim();
assert.equal(version,`teleno_node ${PIN.version}+${PIN.source.slice(0,12)}`,"Unexpected or dirty source identity");
const patchName="libp2p-gcc12-templates.patch",expectedPatch=hash(fs.readFileSync(path.join(__dirname,"patches",patchName)));
const bundle=path.resolve(path.dirname(binary),".."),compatibility=JSON.parse(fs.readFileSync(path.join(bundle,"arm64-compatibility.json"),"utf8"));
assert.equal(compatibility.engineSource,PIN.source);
assert.equal(compatibility.cppLibp2pSource,"c03bf7c44c4fd30a390f3ef93bd1eab482e686a6");
assert.equal(compatibility.patchSha256,expectedPatch);
assert.equal(hash(fs.readFileSync(path.join(bundle,patchName))),expectedPatch);
// The later reviewed release URL must serve these identical archive bytes.
const url=`https://github.com/therexdev/kai-plugin-koinos-node/releases/download/teleno-runtime-${PIN.version}-linux-arm64/${path.basename(archive)}`;
const candidate={...PIN,native:{...PIN.native,arm64:{url,archiveSha256:hash(bytes),binarySha256:hash(elf),glibc:"2.36",publisher:"therexdev (community Linux build)",source:PIN.source,buildPatchSha256:expectedPatch}}};
fs.writeFileSync(output,JSON.stringify(candidate,null,2)+"\n",{flag:"wx"});
console.log(`Recorded ARM64 Linux ${version}; archive ${hash(bytes)}; executable ${hash(elf)}. Not published or signed.`);
