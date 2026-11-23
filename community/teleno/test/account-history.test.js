"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {historyPage,openAccountHistory}=require("../plugin/service/core/lib/koinos/account-history");
const {WalletHistory}=require("../plugin/service/core/lib/koinos/wallet-history");
const {MAINNET_CHAIN}=require("../plugin/service/core/lib/koin-network/payment-network");
const {Signer,utils}=require("../plugin/service/node_modules/koilib");
const account=new Signer({privateKey:"1".repeat(64)}).getAddress(),other=new Signer({privateKey:"2".repeat(64)}).getAddress();
const contracts={koin:new Signer({privateKey:"3".repeat(64)}).getAddress(),vhp:new Signer({privateKey:"4".repeat(64)}).getAddress()};
const id=n=>"0x1220"+BigInt(n).toString(16).padStart(64,"0");
const params={limit:20,ascending:false};

test("protobuf omitted zero is accepted in either order; explicit invalid sequences, duplicates and cursor violations fail",()=>{
  assert.deepEqual(historyPage({values:[{seq_num:"1"},{}]},params).map(e=>e.seq_num),["1","0"]);
  assert.deepEqual(historyPage({values:[{}, {seq_num:"1"}]},{...params,ascending:true}).map(e=>e.seq_num),["0","1"]);
  for(const seq_num of [null,0,-1,"00","-1","18446744073709551616"])assert.throws(()=>historyPage({values:[{seq_num}]},params),/sequence/);
  for(const entries of [[{},{}],[{seq_num:"0"},{seq_num:"1"}],[null]])assert.throws(()=>historyPage({values:entries},params),/sequence/);
  assert.throws(()=>historyPage({values:[{seq_num:"2"}]},{...params,seq_num:"1"}),/sequence/);
  assert.throws(()=>historyPage({values:[{}]},{...params,ascending:true,seq_num:"1"}),/sequence/);
});

test("source selection rejects wrong chains and unavailable services, and propagates cancellation",async()=>{
  const chain={rpcUrls:()=>["wrong","offline","full"],provider:([url])=>({url,call:async()=>{if(url==="offline")throw Error("offline");return {values:[{}]};}})};
  const verify=async p=>{if(p.url==="wrong")throw Error("wrong chain");return MAINNET_CHAIN;};
  assert.equal((await openAccountHistory({chain,account,limit:20,irreversible:true,verify})).provider.url,"full");
  let active=true;const check=()=>{if(!active)throw Error("cancelled");};
  await assert.rejects(openAccountHistory({chain,account,limit:20,irreversible:true,verify:async p=>{active=false;return verify(p);},check}),/cancelled/);
  chain.rpcUrls=()=>["wrong","offline"];
  await assert.rejects(openAccountHistory({chain,account,limit:20,irreversible:true,verify}),/offline/);
});

test("wallet history recovers from an empty preferred RPC, reads omitted sequence zero, and keeps confirmation on one source",async()=>{
  const event={source:contracts.koin,name:"token.transfer_event",data:Buffer.concat([Buffer.from([10,25]),Buffer.from(utils.decodeBase58(other)),Buffer.from([18,25]),Buffer.from(utils.decodeBase58(account)),Buffer.from([24,100])]).toString("base64url")};
  const entry={trx:{transaction:{id:id(1),header:{chain_id:MAINNET_CHAIN,payer:other}},receipt:{id:id(1),events:[event]}}};
  const calls=[],chain={network:()=>({id:"mainnet",tokenSymbol:"KOIN"}),rpcUrls:()=>["empty","full"],provider:([url])=>({
    getChainId:async()=>MAINNET_CHAIN,invokeGetContractAddress:async token=>({value:{address:contracts[token]}}),
    call:async(method,p)=>{assert.equal(method,"account_history.get_account_history");calls.push({url,p});return {values:url==="full"?[entry]:[]};},
  })};
  const result=await new WalletHistory({chain,wallet:{address:account}}).read();
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,"confirmed");assert.equal(result.rows[0].changes[0].amount,"100");assert.equal(result.nextCursor,null);
  assert(calls.some(c=>c.url==="full"&&c.p.irreversible));assert(!calls.some(c=>c.url==="empty"&&c.p.irreversible));
});
