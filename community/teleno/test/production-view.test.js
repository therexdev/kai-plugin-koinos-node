"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),view=require("../plugin/production-view"),dashboard=require("../plugin/dashboard"),{progress,identity}=require("../plugin/setup");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ui={esc,units:String,password:id=>`<input type="password" id="${id}">`,button:(action,label,_kind,blocked)=>`<button data-action="${action}" ${blocked?"disabled":""}>${label}</button>`};
function fixture(){const state={settings:{network:"mainnet",runtime:"native"},runtime:{mode:"observer",platform:"linux",storage:{ready:true}},wallet:{exists:true,address:"wallet"},producer:{exists:true,publicKey:"key"},setup:{goal:"observer",walletBackupSaved:false},head:{recent:false,advancing:true,height:12000},peers:3};const check={runtimeReady:true},evidence={key:identity(state),checkedAt:Date.now(),balances:{vhp:"100000000",mana:"200000000"},registered:"key"};return {state,check,evidence};}
test("dashboard and collapsed observer setup always expose production while syncing",()=>{
  const f=fixture(),g=progress(f.state,f.check,f.evidence);assert.equal(g.complete,true);
  assert.match(dashboard.render(f.state,null,{...ui,progress:g}),/data-action="go-producer"/);
  const panel=view.panel(f.state,g,ui);assert.match(panel,/Production setup/);assert.match(panel,/data-action="produce" disabled/);assert.match(panel,/Syncing/);
});
test("production page shows the exact blockers and never exposes a spending key",()=>{
  const f=fixture(),g=progress(f.state,f.check,f.evidence),html=view.page(f.state,g,ui);
  for(const text of ["Observer sync","Wallet","Signing key","VHP","Registration","Syncing","Review key registration"])assert.ok(html.includes(text),text);
  assert.match(html,/data-action="produce" disabled/);assert.match(html,/id="producer-password"/);
  f.evidence.balances=null;f.evidence.balancesError='<img src=x onerror="steal()">';assert.ok(!view.page(f.state,progress(f.state,f.check,f.evidence),ui).includes('<img'));
});
test("only fresh complete readiness enables review; viewing never changes the node mode",()=>{
  const f=fixture();f.state.head.recent=true;let g=progress(f.state,f.check,f.evidence);assert.equal(g.canProduce,true);assert.match(view.panel(f.state,g,ui),/data-action="produce" >Enable block production/);assert.equal(f.state.runtime.mode,"observer");
  f.evidence.checkedAt-=61000;g=progress(f.state,f.check,f.evidence);assert.equal(g.canProduce,false);assert.match(view.page(f.state,g,ui),/data-action="produce" disabled/);
});
