"use strict";
// Read-only checklist model. Actual actions retain their native service checks.
(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.TelenoSetup=factory();})(globalThis,()=>{
  const positive=value=>{try{return BigInt(value)>0n;}catch{return false;}};
  function identity(state){return JSON.stringify([state.settings.network,state.wallet.address||null,state.producer.publicKey||null]);}
  function progress(state,runtimeCheck,productionCheck,now=Date.now()) {
    const {runtime:r,settings:s,wallet:w,producer:p}=state,goal=state.setup?.goal==="observer"?"observer":"producer";
    const windows=r.platform==="win32",locked=r.mode!=="stopped"||!!r.recoveryPending;
    const runtimeReady=!!runtimeCheck?.runtimeReady&&!r.migrationPending&&(!windows||(runtimeCheck.wslReady&&s.runtime==="wsl"));
    const evidence=productionCheck?.key===identity(state)&&now>=productionCheck.checkedAt&&now-productionCheck.checkedAt<60000?productionCheck:null;
    const synced=["observer","producer"].includes(r.mode)&&!!state.head?.recent&&!!state.head?.advancing&&state.peers>0;
    const walletReady=!!w.exists,backupReady=walletReady&&!!state.setup?.walletBackupSaved,keyReady=!!p.exists&&!!p.publicKey;
    const funded=!!evidence?.balances&&positive(evidence.balances.vhp),registered=keyReady&&!!evidence&&evidence.registered===p.publicKey;
    const canRegister=runtimeReady&&walletReady&&keyReady&&!state.pending&&positive(evidence?.balances?.mana);
    const canProduce=runtimeReady&&r.mode==="observer"&&synced&&funded&&registered&&!state.pending;
    const steps=[];
    if(windows)steps.push({id:"wsl",title:"Set up WSL2 and Ubuntu",done:!!runtimeCheck?.wslReady});
    steps.push({id:"runtime",title:windows&&(s.runtime!=="wsl"||r.migrationPending)?"Switch and install Teleno":"Install Teleno",done:runtimeReady});
    if(goal==="producer")steps.push(
      {id:"wallet",title:"Create your Teleno wallet",done:walletReady},
      {id:"wallet-backup",title:"Save your wallet backup",done:backupReady},
      {id:"key",title:"Create a block-signing key",done:keyReady});
    steps.push({id:"sync",title:"Start an observer and sync",done:synced});
    if(goal==="producer")steps.push(
      {id:"fund",title:"Fund your wallet and get VHP",done:funded},
      {id:"register",title:"Register your signing key",done:registered&&!state.pending},
      {id:"produce",title:"Enable block production",done:r.mode==="producer"});
    const current=steps.findIndex(step=>!step.done);
    return {goal,windows,locked,runtimeReady,synced,walletReady,backupReady,keyReady,evidence,funded,registered,canRegister,canProduce,
      complete:current===-1,completed:steps.filter(step=>step.done).length,
      steps:steps.map((step,index)=>({...step,number:index+1,current:index===current}))};
  }
  return {identity,progress};
});
