"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{identity,progress}=require("../plugin/setup");
function state(){return {settings:{network:"mainnet",runtime:"wsl"},runtime:{platform:"win32",mode:"stopped"},wallet:{exists:false},producer:{exists:false},setup:{goal:"producer",walletBackupSaved:false}};}
const runtime={wslReady:true,runtimeReady:true},current=g=>g.steps.find(s=>s.current)?.id;
function funded(s){return {key:identity(s),checkedAt:Date.now(),balances:{koin:"200000000",vhp:"100000000",mana:"500000000"},registered:s.producer.publicKey};}
test("producer guide orders wallet and backup and signing key before observer startup",()=>{
  const s=state();assert.equal(current(progress(s,{wslReady:false,runtimeReady:false})),"wsl");
  assert.equal(current(progress(s,{wslReady:true,runtimeReady:false})),"runtime");
  assert.equal(current(progress(s,runtime)),"wallet");s.wallet={exists:true,address:"wallet"};
  assert.equal(current(progress(s,runtime)),"wallet-backup");s.setup.walletBackupSaved=true;
  assert.equal(current(progress(s,runtime)),"key");s.producer={exists:true,publicKey:"key"};
  assert.equal(current(progress(s,runtime)),"sync");
  s.runtime.mode="observer";s.head={recent:true,advancing:true};s.peers=2;
  assert.equal(current(progress(s,runtime)),"fund");
  const evidence=funded(s);evidence.registered=null;assert.equal(current(progress(s,runtime,evidence)),"register");
  evidence.registered="key";assert.equal(current(progress(s,runtime,evidence)),"produce");assert.equal(progress(s,runtime,evidence).canProduce,true);
  s.runtime.mode="producer";assert.equal(progress(s,runtime,evidence).complete,true);
});
test("observer guide omits wallet, keys and funding without changing node mode",()=>{
  const s=state();s.setup.goal="observer";assert.deepEqual(progress(s,runtime).steps.map(x=>x.id),["wsl","runtime","sync"]);
  assert.equal(s.runtime.mode,"stopped");assert.equal(progress(s,runtime).complete,false);
  s.runtime.mode="observer";s.head={recent:true,advancing:true};s.peers=1;assert.equal(progress(s,runtime).complete,true);
});
test("unavailable, expired, wrong-network and wrong-key evidence never marks funding or registration complete",()=>{
  const s=state();s.wallet={exists:true,address:"wallet"};s.producer={exists:true,publicKey:"key"};const evidence=funded(s);
  for(const stale of [{...evidence,balances:null,registered:null},{...evidence,checkedAt:Date.now()-61000},{...evidence,checkedAt:Date.now()+61000},{...evidence,key:"another identity"}]){
    const g=progress(s,runtime,stale);assert.equal(g.funded,false);assert.equal(g.registered,false);assert.equal(g.canProduce,false);
  }
  s.settings.network="harbinger";assert.equal(progress(s,runtime,evidence).registered,false);
  s.settings.network="mainnet";s.producer.publicKey="replacement";assert.equal(progress(s,runtime,evidence).registered,false);
});
test("production stays blocked during pending transactions, stale sync or missing peers",()=>{
  const s=state();s.wallet={exists:true,address:"wallet"};s.producer={exists:true,publicKey:"key"};s.runtime.mode="observer";s.head={recent:true,advancing:true};s.peers=1;
  const evidence=funded(s);assert.equal(progress(s,runtime,evidence).canProduce,true);
  s.pending={txId:"pending"};assert.equal(progress(s,runtime,evidence).canProduce,false);assert.equal(progress(s,runtime,evidence).canRegister,false);
  s.pending=null;s.peers=0;assert.equal(progress(s,runtime,evidence).canProduce,false);
  s.peers=1;s.head.recent=false;assert.equal(progress(s,runtime,evidence).synced,false);
  s.head.recent=true;s.head.advancing=false;assert.equal(progress(s,runtime,evidence).synced,false);
});
test("Linux has the same complete guide without a WSL step; interrupted migration stays incomplete",()=>{
  const s=state();s.runtime.platform="linux";s.settings.runtime="native";
  assert.equal(progress(s,{runtimeReady:false}).steps[0].id,"runtime");assert.equal(progress(s,{runtimeReady:true}).steps.length,8);
  s.runtime.migrationPending=true;assert.equal(progress(s,{runtimeReady:true}).runtimeReady,false);
});
