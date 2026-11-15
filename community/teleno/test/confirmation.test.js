"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {create}=require("../plugin/service");
const {Provider}=require("../plugin/service/node_modules/koilib");
const CHAIN="EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==",TX="0x1220"+"a".repeat(64),BLOCK="0x1220"+"b".repeat(64),HEAD="0x1220"+"c".repeat(64);
function fixture(t,{included=true,lib="101",canonical=true,reverted=false,receipt=true,rpcError=false,chainId=CHAIN,txChain=CHAIN,waitLookup,newSubmission=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"teleno-confirmation-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const transaction={id:TX,header:{chain_id:CHAIN,payer:"test-wallet",nonce:"KAE="},operations:[],signatures:["fixture"]};
  if(!newSubmission)fs.writeFileSync(path.join(root,"transactions.json"),JSON.stringify({pending:{network:"mainnet",address:"test-wallet",kind:"producer.register",createdAt:Date.now(),txId:TX,transaction}}));
  const calls=[],provider={getChainId:async()=>chainId,getHeadInfo:async()=>({head_topology:{id:HEAD,height:"102"},last_irreversible_block:lib}),call:async(method)=>{
    calls.push(method);if(rpcError)throw Error("RPC timed out");
    if(method==="chain.submit_transaction"){
      assert.ok(newSubmission);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"transactions.json"))).pending.transaction,transaction);
      return {receipt:{id:TX}};
    }
    if(method==="transaction_store.get_transactions_by_id"){if(waitLookup)await waitLookup;return {transactions:[{transaction,containing_blocks:included?[BLOCK]:[]}]};}
    if(method==="block_store.get_blocks_by_id")return {block_items:[{block_id:BLOCK,block_height:"100",block:{id:BLOCK,header:{height:"100"},transactions:[{...transaction,header:{...transaction.header,chain_id:txChain}}]},receipt:{id:BLOCK,height:"100",transaction_receipts:receipt?[{id:TX,payer:"test-wallet",...(reverted?{reverted:true}:{})}]:[]}}]};
    if(method==="block_store.get_blocks_by_height")return {block_items:canonical?[{block_id:BLOCK,block_height:"100"}]:[]};
    throw Error("Unexpected RPC method: "+method);
  }};
  provider.sendTransaction=Provider.prototype.sendTransaction;
  const chain={rpcUrls:()=>["https://example.invalid"],provider:()=>provider,isValidAddress:()=>true},wallet={address:"test-wallet",status:()=>({address:"test-wallet",exists:true,unlocked:false}),signerFor:()=>({}),lock(){}},controller=new AbortController();
  const submit=async()=>{
    const sent=await chain.provider().sendTransaction(transaction);
    // Exercise the real SDK mutation, not a simplified provider substitute.
    assert.equal(sent.transaction,transaction);assert.equal(typeof transaction.wait,"function");
    return {txId:transaction.id,confirmed:false};
  };
  Object.assign(chain,{transfer:submit,burn:submit,registerProducerKey:submit});
  const reviews=[];
  const api={version:1,plugin:{id:"community.teleno-node",dataDir:root},signal:controller.signal,desktop:{confirm:async(title)=>{if(!newSubmission)throw Error("Confirmation checking must not request signing approval");reviews.push(title);return true;}}};
  const service=create(api,{platform:"linux",chain,wallet,electron:{}});t.after(()=>service.dispose());
  return {service,root,calls,api,chain,wallet,reviews};
}
for(const method of ["wallet.send","wallet.burn","producer.register"])test(`${method} confirms in the same session after the real SDK attaches transaction.wait`,async t=>{
  const {service,root,calls,reviews}=fixture(t,{newSubmission:true});
  if(method==="producer.register")await service.call("producer.key");
  const input={password:"fixture-password",amount:"1",token:"koin",to:"test-recipient"};
  const submitted=await service.call(method,input);assert.equal(structuredClone(submitted).txId,TX);
  const file=path.join(root,"transactions.json"),saved=JSON.parse(fs.readFileSync(file));
  assert.equal(saved.pending.kind,method);assert.equal(Object.hasOwn(saved.pending.transaction,"wait"),false);
  await assert.rejects(service.call(method,input),/needs confirmation/);
  const reviewCount=reviews.length,result=await service.call("wallet.pending");
  assert.equal(result.confirmed,true,result.note);assert.equal(result.reverted,false);
  const status=structuredClone(await service.call("status"));assert.equal(status.pending,null);assert.equal(status.lastTransaction.kind,method);
  assert.equal(JSON.parse(fs.readFileSync(file)).pending,null);assert.equal(reviews.length,reviewCount);
  assert.equal(calls.filter(name=>name==="chain.submit_transaction").length,1);
});
test("confirmed registration clears its pending journal and retains a visible result across reopen",async t=>{
  const f=fixture(t),result=await f.service.call("wallet.pending");assert.equal(result.confirmed,true);assert.equal(result.reverted,false);assert.equal(result.blockHeight,"100");
  const status=await f.service.call("status");assert.equal(status.pending,null);assert.equal(status.lastTransaction.kind,"producer.register");assert.equal(status.lastTransaction.txId,TX);
  await f.service.dispose();const reopened=create(f.api,{platform:"linux",chain:f.chain,wallet:f.wallet,electron:{}});
  try{assert.equal((await reopened.call("status")).lastTransaction.blockHeight,"100");}finally{await reopened.dispose();}
  assert.ok(f.calls.every(name=>!name.includes("submit")));
});
test("included transaction waits for irreversibility and displays block progress",async t=>{
  const {service}=fixture(t,{lib:"99"});const result=await service.call("wallet.pending");assert.equal(result.state,"included");assert.equal(result.blockHeight,"100");assert.equal(result.irreversibleHeight,"99");assert.equal((await service.call("status")).pending.state,"included");
});
test("an unindexed transaction remains pending without a second submission",async t=>{
  const {service,calls}=fixture(t,{included:false});const result=await service.call("wallet.pending");assert.equal(result.state,"submitted");assert.equal(result.pending,true);assert.deepEqual(calls,["transaction_store.get_transactions_by_id"]);
});
test("RPC failure remains visible and preserves the original signed journal",async t=>{
  const {service,root}=fixture(t,{rpcError:true}),file=path.join(root,"transactions.json"),before=fs.readFileSync(file);
  const result=await service.call("wallet.pending");assert.equal(result.state,"unavailable");assert.match(result.note,/RPC timed out/);assert.deepEqual(fs.readFileSync(file),before);
});
test("forks, missing receipts, and wrong transaction chains never release the pending transaction",async t=>{
  for(const options of [{canonical:false},{receipt:false},{txChain:"other-chain"},{chainId:"other-chain"}]){
    const {service,root}=fixture(t,options);const result=await service.call("wallet.pending");assert.equal(result.pending,true);assert.ok(JSON.parse(fs.readFileSync(path.join(root,"transactions.json"))).pending);assert.equal((await service.call("status")).lastTransaction,null);
  }
});
test("finalized reverted execution is shown as reverted rather than a successful registration",async t=>{
  const {service}=fixture(t,{reverted:true});const result=await service.call("wallet.pending");assert.equal(result.confirmed,true);assert.equal(result.reverted,true);const status=await service.call("status");assert.equal(status.pending,null);assert.equal(status.lastTransaction.reverted,true);
});
test("concurrent confirmation checks share one lookup and never block stopping the node",async t=>{
  let release;const waitLookup=new Promise(resolve=>{release=resolve;}),{service,calls}=fixture(t,{waitLookup});
  const first=service.call("wallet.pending"),second=service.call("wallet.pending");
  try{await service.call("node.stop");assert.equal((await service.call("status")).pending.txId,TX);}finally{release();}
  const results=await Promise.all([first,second]);assert.equal(results[0].confirmed,true);assert.deepEqual(results[0],results[1]);
  assert.equal(calls.filter(name=>name==="transaction_store.get_transactions_by_id").length,1);
});
