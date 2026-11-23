"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {MiningStats}=require("../plugin/service/mining-stats"),{Signer,utils}=require("../plugin/service/node_modules/koilib");
const account=new Signer({privateKey:"1".repeat(64)}).getAddress(),other=new Signer({privateKey:"2".repeat(64)}).getAddress();
const contracts={koin:new Signer({privateKey:"3".repeat(64)}).getAddress(),vhp:new Signer({privateKey:"4".repeat(64)}).getAddress()},chainId="verified-chain",now=1800000000000;
const id=n=>"0x1220"+BigInt(n).toString(16).padStart(64,"0");
function event(token,type,amount,to=account){let n=BigInt(amount),bytes=[];do{bytes.push(Number(n&127n)|(n>127n?128:0));n>>=7n;}while(n);return {source:contracts[token],name:`token.${type}_event`,data:Buffer.concat([Buffer.from([10,25]),Buffer.from(utils.decodeBase58(to)),Buffer.from([16,...bytes])]).toString("base64url")};}
function block(seq,height=Number(seq)+1,{signer=account,reward="125000000",vhp="100000000"}={}){return {seq_num:String(seq),block:{id:id(height),header:{height:String(height),timestamp:String(now-height*1000),signer},receipt:{id:id(height),events:[event("koin","mint",reward,signer),event("vhp","burn",vhp,signer)]}}};}
function tx(seq,events=[]){return {seq_num:String(seq),trx:{transaction:{id:id(100000+Number(seq)),header:{chain_id:chainId,payer:account}},receipt:{events}}};}
function fixture(entries=[]){let at=now,network="mainnet",writes=0;const store=new Map(),calls=[],wallet={address:account};
  const provider={invokeGetContractAddress:async token=>({value:{address:contracts[token]}}),getHeadInfo:async()=>({last_irreversible_block:"9999999"}),call:async(method,p)=>{calls.push(p);assert.equal(method,"account_history.get_account_history");assert.equal(p.irreversible,true);const ordered=entries.filter(e=>p.seq_num===undefined||(p.ascending?BigInt(e.seq_num)>=BigInt(p.seq_num):BigInt(e.seq_num)<=BigInt(p.seq_num))).sort((a,b)=>BigInt(a.seq_num)<BigInt(b.seq_num)?-1:1);return {values:(p.ascending?ordered:ordered.reverse()).slice(0,p.limit)};}};
  const chain={network:()=>({id:network}),rpcUrls:()=>["https://fixture.invalid"],provider:()=>provider},state={get:(k,fallback)=>structuredClone(store.get(k)??fallback),set:(k,v)=>{writes++;store.set(k,structuredClone(v));}},checkNetwork=async()=>chainId;
  return {stats:new MiningStats({chain,wallet,state,checkNetwork,clock:()=>at}),wallet,chain,provider,state,store,calls,advance:()=>{at+=16000;},switchNetwork:()=>{network="harbinger";},writes:()=>writes};
}
test("mining totals count irreversible own block receipts, excluding deposits, transaction mints and another producer",async()=>{
  const f=fixture([tx(0,[event("koin","mint","900000000")]),block(1,2),block(2,3,{signer:other}),block(3,4)]);
  const result=await f.stats.read();assert.deepEqual(result.totals,{blocks:"2",rewards:"250000000",vhp:"200000000",profit:"50000000"});assert.equal(result.syncing,false);assert.deepEqual(result.feed.map(r=>r.height),["4","2"]);assert(result.feed.every(r=>r.status==="confirmed"));
  f.advance();assert.deepEqual((await f.stats.read()).totals,result.totals);assert.equal(f.writes(),1);
  const reopened=new MiningStats({chain:f.chain,wallet:f.wallet,state:f.state,checkNetwork:async()=>chainId,clock:()=>now+32000});assert.deepEqual((await reopened.read()).totals,result.totals);
});
test("bounded backfill reports partial totals and resumes at the exact sequence without double counting",async()=>{
  const entries=Array.from({length:305},(_,i)=>block(i));const f=fixture(entries),first=await f.stats.read();assert.equal(first.totals.blocks,"300");assert.equal(first.syncing,true);assert.equal(first.feed.length,40);assert.equal(first.feed[0].height,"305");
  f.advance();const last=await f.stats.read();assert.equal(last.totals.blocks,"305");assert.equal(last.syncing,false);assert.equal(last.feed[0].height,"305");
  assert(f.calls.some(p=>p.seq_num==="300"&&p.ascending));
});
test("empty histories report zero and history failures do not erase saved totals",async()=>{
  const empty=fixture();empty.provider.call=async()=>({});assert.equal((await empty.stats.read()).totals.blocks,"0");
  const f=fixture([block(0)]);await f.stats.read();const before=structuredClone([...f.store]);f.advance();f.provider.call=async()=>{throw Error("history offline");};await assert.rejects(f.stats.read(),/offline/);assert.deepEqual([...f.store],before);
});
test("malformed history, duplicate blocks and sequence gaps fail without advancing durable totals",async()=>{
  for(const entries of [[block(0,10),block(1,10)],[block(0),block(2)],[{...block(0),seq_num:"9007199254740993"}]]){const f=fixture(entries);await assert.rejects(f.stats.read(),/block|sequence gap/);assert.equal(f.store.size,0);}
  const f=fixture([block(0)]);f.provider.getHeadInfo=async()=>({last_irreversible_block:"0"});await assert.rejects(f.stats.read(),/irreversible producer/);assert.equal(f.store.size,0);
});
test("wallet and network changes during RPC reads cannot write or expose another identity's totals",async()=>{
  for(const change of [f=>{f.wallet.address=other;},f=>f.switchNetwork()]){const f=fixture([block(0)]),original=f.provider.call;f.provider.call=async(...args)=>{const result=await original(...args);change(f);return result;};await assert.rejects(f.stats.read(),/Wallet or network changed/);assert.equal(f.store.size,0);}
  const f=fixture([block(0)]);await f.stats.read();f.switchNetwork();f.advance();assert.equal((await f.stats.read()).network,"harbinger");assert.equal(f.store.size,2);
});
test("corrupt saved mining state is preserved and concurrent refreshes share one index operation",async()=>{
  const f=fixture([block(0)]);const [a,b]=await Promise.all([f.stats.read(),f.stats.read()]);assert.deepEqual(a,b);assert.equal(f.writes(),1);
  const key=[...f.store.keys()][0];f.store.set(key,{cursor:"bad"});f.advance();await assert.rejects(f.stats.read(),/original file was preserved/);assert.deepEqual(f.store.get(key),{cursor:"bad"});
});
test("cancellation after an RPC await prevents history persistence",async()=>{const f=fixture([block(0)]);let active=true;const original=f.provider.call;f.provider.call=async(...args)=>{const result=await original(...args);active=false;return result;};await assert.rejects(f.stats.read(()=>{if(!active)throw Error("cancelled");}),/cancelled/);assert.equal(f.store.size,0);});

test("an omitted protobuf sequence zero does not block indexing or reopening",async()=>{
  const f=fixture([tx(0),block(1)]),call=f.provider.call;
  f.provider.call=async(...args)=>{const result=structuredClone(await call(...args));for(const entry of result.values)if(entry.seq_num==="0")delete entry.seq_num;return result;};
  const result=await f.stats.read();assert.equal(result.totals.blocks,"1");assert.equal(result.throughSequence,"1");assert.equal(result.feed[0].height,"2");
  const reopened=new MiningStats({chain:f.chain,wallet:f.wallet,state:f.state,checkNetwork:async()=>chainId,clock:()=>now+32000});
  assert.deepEqual((await reopened.read()).totals,result.totals);
});

test("empty or incomplete primary index cannot hide rewards in a fuller RPC and every backfill uses that source",async()=>{
  for(const primary of [[],[tx(0)]]){
    const f=fixture([tx(0),block(1),block(2)]),calls=[];
    f.chain.rpcUrls=()=>["https://primary.invalid","https://full.invalid"];
    f.chain.provider=urls=>({...f.provider,call:async(method,p)=>{
      calls.push({url:urls[0],p});if(urls[0]==="https://primary.invalid"){assert.equal(p.ascending,false);return {values:primary};}
      const result=structuredClone(await f.provider.call(method,p));for(const entry of result.values)if(entry.seq_num==="0")delete entry.seq_num;return result;
    }});
    const result=await f.stats.read();assert.equal(result.totals.blocks,"2");assert.equal(result.totals.rewards,"250000000");
    assert.equal(result.syncing,false);assert(calls.some(c=>c.url==="https://full.invalid"&&c.p.ascending));
    f.advance();assert.deepEqual((await f.stats.read()).totals,result.totals);
  }
});
