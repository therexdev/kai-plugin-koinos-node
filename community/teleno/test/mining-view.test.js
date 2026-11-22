"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),view=require("../plugin/mining");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),ui={esc,units:s=>String(BigInt(s)/100000000n),button:(action,label)=>`<button data-action="${action}">${label}</button>`},now=1800000000000;
const state=()=>({settings:{network:"mainnet"},wallet:{exists:true,address:"selected-wallet",unlocked:false},runtime:{mode:"producer"},head:{height:12345,lib:12330,time:now-10000,recent:true,advancing:true},peers:8});
const data=()=>({address:"selected-wallet",network:"mainnet",observedAt:now,balances:{koin:"500000000",vhp:"1000000000",mana:"300000000"},mining:{totals:{blocks:"12",rewards:"1200000000",vhp:"1000000000"},syncing:false,feed:[{id:"0x1220"+"a".repeat(64),height:"12300",timestamp:now-600000,reward:"100000000",vhp:"80000000",status:"confirmed"}]}});
test("overview distinguishes enabled production, observer sync, stale heads and stopped processes",()=>{
  const s=state();assert.equal(view.health(s,now).tone,"good");s.runtime.mode="observer";assert.match(view.health(s,now).title,/Observer connected/);s.head.advancing=false;assert.match(view.health(s,now).title,/syncing/);s.runtime.mode="producer";assert.match(view.health(s,now).title,/checking progress/);s.runtime.mode="stopped";assert.equal(view.health(s,now).tone,"idle");s.runtime.recoveryPending=true;assert.match(view.health(s,now).title,/recovery/);
});
test("overview shows wallet balances, confirmed mining totals and dated rewards while preserving escaping",()=>{
  const s=state(),d=data(),html=view.render(s,d,ui,now);for(const label of ["selected-wallet","Blocks produced","Block rewards","VHP consumed","12","12300","Confirmed","Latest confirmed reward","deposits".replace("d","D")])assert(html.includes(label),label);
  d.miningError='<img src=x onerror="steal()">';assert(!view.render(s,d,ui,now).includes('<img'));assert.match(view.render(s,d,ui,now),/out of date/);
});
test("switching wallet/network immediately hides prior totals, and partial history never claims lifetime completeness",()=>{
  const s=state(),d=data();s.settings.network="harbinger";let html=view.render(s,d,ui,now);assert(!html.includes("#12300"));assert.match(html,/Loading mining details/);s.settings.network="mainnet";d.mining.syncing=true;html=view.render(s,d,ui,now);assert.match(html,/Totals are partial/);assert(!html.includes("lifetime"));
});
