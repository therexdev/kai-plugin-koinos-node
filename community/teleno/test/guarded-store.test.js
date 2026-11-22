"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {GuardedStore}=require("../plugin/service/guarded-store");
function fixture(t){
  // Match service initialization, which resolves macOS's /var temp alias.
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"teleno-store-")));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,"transactions.json");return {root,file,store:new GuardedStore(file)};
}
test("saved records stay independent of caller and reader mutations",t=>{
  const {file,store}=fixture(t),pending={txId:"original",transaction:{header:{nonce:"KAE="},signatures:["signature"]}};
  const original=structuredClone(pending);store.set("pending",pending);
  pending.transaction.wait=async()=>{};pending.transaction.header.nonce="changed";pending.transaction.signatures.push("changed");
  const read=store.get("pending");assert.deepEqual(read,original);
  read.transaction.wait=async()=>{};read.transaction.header.nonce="reader mutation";
  assert.deepEqual(store.get("pending"),original);
  store.set("last",{txId:"previous"});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).pending,original);
  assert.deepEqual(new GuardedStore(file).get("pending"),original);
});
test("non-cloneable input fails before changing the journal or its backups",t=>{
  const {root,file,store}=fixture(t);store.set("pending",{txId:"preserved"});
  const before=fs.readFileSync(file),files=fs.readdirSync(root);
  assert.throws(()=>store.set("last",{wait:async()=>{}}),{name:"DataCloneError"});
  assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readdirSync(root),files);
  assert.deepEqual(store.get("pending"),{txId:"preserved"});assert.equal(store.get("last",null),null);
  store.set("last",{txId:"safe"});assert.equal(store.get("last").txId,"safe");
});
test("a frequently refreshed derived index stays bounded and still preserves externally changed data",t=>{
  const {root,file}=fixture(t),index=new GuardedStore(file,{backup:false});
  index.set("mining.cursor","100");index.set("mining.cursor","200");
  assert.deepEqual(fs.readdirSync(root),[path.basename(file)]);assert.equal(new GuardedStore(file).get("mining.cursor"),"200");
  fs.writeFileSync(file,"unreadable external data");assert.throws(()=>index.set("mining.cursor","300"),/changed outside/);assert.equal(fs.readFileSync(file,"utf8"),"unreadable external data");
});
