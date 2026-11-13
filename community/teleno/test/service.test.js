"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {create,amount}=require("../plugin/service");
function fixture(t,{approve=true,runtime,chain,electron}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"kai-teleno-test-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const signal=new AbortController(),reviews=[];
  const api={version:1,plugin:{id:"community.teleno-node",version:"1.0.0",dataDir:path.join(root,"community.teleno-node")},signal:signal.signal,
    desktop:{confirm:async(title,detail)=>{reviews.push({title,detail});return approve;},hostWindowId:()=>1}};
  const service=create(api,{platform:"linux",electron:electron||{clipboard:{writeText(){}},dialog:{showMessageBox:async()=>({response:0})},BrowserWindow:{fromId:()=>({})}},runtime,chain});
  t.after(async()=>{signal.abort();await service.dispose();});return {root,api,service,reviews,signal};
}
const MAINNET="EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
function fakeChain({fail=false,chainId=MAINNET}={}) {
  let sends=0,stopBeforeSign=null;
  const chain={rpcUrls:()=>["https://example.invalid"],network:()=>({id:"mainnet"}),isValidAddress:()=>true,clearCache(){},provider:()=>({getChainId:async()=>chainId,sendTransaction:async()=>{sends++;if(fail)throw Error("Transport uncertain");return {};}}),
    async transfer(signer){if(stopBeforeSign)await stopBeforeSign();await signer.signHash(Buffer.alloc(32,1));const p=chain.provider();await p.sendTransaction({id:"0x1220"+"a".repeat(64),header:{chain_id:chainId},signatures:["test-signature"]});return {txId:"0x1220"+"a".repeat(64),confirmed:false};}};
  return {chain,sends:()=>sends,beforeSign:fn=>{stopBeforeSign=fn;}};
}
test("separate encrypted wallet and hot key survive lock/reopen without changing other profiles",async t=>{
  const {root,service,api}=fixture(t);const sibling=path.join(root,"kai.koinos-node");fs.mkdirSync(sibling);fs.writeFileSync(path.join(sibling,"wallet.json"),"other-wallet-do-not-touch");
  const created=await service.call("wallet.create",{password:"test-password-123"});assert.equal(created.unlocked,true);assert.equal(Object.hasOwn(created,"wif"),false);
  const key=await service.call("producer.key");assert.equal(Buffer.from(key.publicKey,"base64url").length,33);
  const {Signer}=require("../plugin/service/node_modules/koilib");const hot=Signer.fromWif(fs.readFileSync(path.join(api.plugin.dataDir,"chains/mainnet/block_producer/private.key"),"utf8").trim());assert.notEqual(hot.getAddress(),created.address);
  await service.call("wallet.lock");assert.equal((await service.call("status")).wallet.unlocked,false);
  await assert.rejects(service.call("wallet.unlock",{password:"wrong"}),/password/i);
  const status=await service.call("wallet.unlock",{password:"test-password-123"});assert.equal(status.address,created.address);
  const keystore=JSON.parse(fs.readFileSync(path.join(api.plugin.dataDir,"wallet/wallet.json")));assert.ok(keystore.crypto.ciphertext);assert.equal(keystore.privateKey,undefined);
  assert.equal(fs.readFileSync(path.join(sibling,"wallet.json"),"utf8"),"other-wallet-do-not-touch");
});
test("denied native review never creates wallet or producer key",async t=>{
  const {service,api}=fixture(t,{approve:false});await assert.rejects(service.call("wallet.create",{password:"test-password-123"}),/cancelled/);await assert.rejects(service.call("producer.key"),/cancelled/);assert.equal(fs.existsSync(path.join(api.plugin.dataDir,"wallet/wallet.json")),false);assert.equal(fs.existsSync(path.join(api.plugin.dataDir,"chains/mainnet/block_producer/private.key")),false);
});
test("corrupt wallet is preserved and never silently replaced",async t=>{
  const {service,api}=fixture(t);const dir=path.join(api.plugin.dataDir,"wallet");fs.mkdirSync(dir);const file=path.join(dir,"wallet.json");fs.writeFileSync(file,"bad-json");await assert.rejects(service.call("wallet.create",{password:"test-password-123"}),/unreadable/);assert.equal(fs.readFileSync(file,"utf8"),"bad-json");
});
test("production cannot start without an advancing observer",async t=>{
  const {service}=fixture(t);await service.call("wallet.create",{password:"test-password-123"});await service.call("producer.key");await assert.rejects(service.call("producer.start"),/observer/);
});
test("invalid amounts and settings fail before native approval",async t=>{
  for(const input of ["-1","1e3","0",".1","1.123456789","9000000000000","1\n2"])assert.throws(()=>amount(input));assert.equal(amount("1.00000001"),"100000001");
  const {service,reviews}=fixture(t);await assert.rejects(service.call("settings.save",{rpcPort:100,p2pPort:100}),/ports/);assert.equal(reviews.length,0);
  await assert.rejects(service.call("settings.save",{network:"../../wallet"}),/Invalid/);
});
test("shutdown revokes queued mutations",async t=>{
  const {service,signal}=fixture(t);signal.abort();await assert.rejects(service.call("wallet.create",{password:"test-password-123"}));
});
test("native key backup never returns private data to renderer",async t=>{
  const {service}=fixture(t);await service.call("wallet.create",{password:"test-password-123"});assert.deepEqual(await service.call("wallet.backup",{password:"test-password-123"}),{nativeShown:true});assert.equal((await service.call("status")).setup.walletBackupSaved,false);
});
test("wallet backup completes only after explicit native acknowledgement and survives reopen",async t=>{
  const answers=[1,2];let copied;
  const electron={clipboard:{writeText:value=>{copied=value;}},dialog:{showMessageBox:async()=>({response:answers.shift()})},BrowserWindow:{fromId:()=>({})}};
  const {service,api}=fixture(t,{electron});await service.call("wallet.create",{password:"test-password-123"});
  const result=await service.call("wallet.backup",{password:"test-password-123"});assert.equal(result.nativeShown,true);assert.ok(copied);assert.equal(JSON.stringify(result).includes(copied),false);
  assert.equal((await service.call("status")).setup.walletBackupSaved,true);
  await service.dispose();const reopened=create(api,{platform:"linux",electron});
  try{const status=await reopened.call("status");assert.equal(status.setup.walletBackupSaved,true);assert.equal(JSON.stringify(status).includes(copied),false);}finally{await reopened.dispose();}
});
test("changing setup instructions does not create a wallet or start production",async t=>{
  const {service}=fixture(t);await service.call("setup.goal",{goal:"observer"});const status=await service.call("status");
  assert.equal(status.setup.goal,"observer");assert.equal(status.runtime.mode,"stopped");assert.equal(status.wallet.exists,false);
  await assert.rejects(service.call("setup.goal",{goal:"automatic-production"}),/Choose observer/);
});
test("production setup reports read failures as unavailable rather than empty balances",async t=>{
  const fake=fakeChain();fake.chain.balances=async()=>{throw Error("RPC temporarily unavailable");};fake.chain.registeredPublicKey=async()=>null;
  const {service}=fixture(t,{chain:fake.chain});await service.call("wallet.create",{password:"test-password-123"});await service.call("producer.key");
  const checked=await service.call("setup.productionStatus");assert.equal(checked.balances,null);assert.match(checked.balancesError,/unavailable/);assert.equal(checked.registered,null);assert.equal(fake.sends(),0);
});
test("uncertain wallet submission is persisted before transport and blocks duplicates",async t=>{
  const fake=fakeChain({fail:true}),{service,api}=fixture(t,{chain:fake.chain});await service.call("wallet.create",{password:"test-password-123"});
  const input={password:"test-password-123",to:"test-address",amount:"1",token:"koin"};
  await assert.rejects(service.call("wallet.send",input),/uncertain/);assert.equal(fake.sends(),1);
  const saved=JSON.parse(fs.readFileSync(path.join(api.plugin.dataDir,"transactions.json")));assert.equal(saved.pending.txId,"0x1220"+"a".repeat(64));assert.equal(JSON.stringify(saved).includes("test-password"),false);
  await assert.rejects(service.call("wallet.send",input),/confirmation/);await assert.rejects(service.call("settings.save",{network:"harbinger"}),/confirmation/);assert.equal(fake.sends(),1);
});
test("cancellation between transaction preparation and signing prevents submission",async t=>{
  const fake=fakeChain(),{service}=fixture(t,{chain:fake.chain}),operation=new AbortController();await service.call("wallet.create",{password:"test-password-123"});fake.beforeSign(async()=>{await Promise.resolve();operation.abort();});
  await assert.rejects(service.call("wallet.send",{password:"test-password-123",to:"test-address",amount:"1",token:"koin"},operation.signal));assert.equal(fake.sends(),0);
});
test("wrong RPC chain never signs or submits funds",async t=>{
  const fake=fakeChain({chainId:"unrelated-chain"}),{service}=fixture(t,{chain:fake.chain});await service.call("wallet.create",{password:"test-password-123"});await assert.rejects(service.call("wallet.send",{password:"test-password-123",to:"test-address",amount:"1",token:"koin"}),/network identity/);assert.equal(fake.sends(),0);
});
