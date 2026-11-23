"use strict";
// Read-only checklist model. Actual actions retain their native service checks.
(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.TelenoSetup=factory();})(globalThis,()=>{
  const positive=value=>{try{return BigInt(value)>0n;}catch{return false;}};
  function identity(state){return JSON.stringify([state.settings.network,state.wallet.address||null,state.producer.publicKey||null]);}
  function progress(state,runtimeCheck,productionCheck,now=Date.now()) {
    const {runtime:r,settings:s,wallet:w,producer:p}=state,goal=state.setup?.goal==="observer"?"observer":"producer";
    const storageReady=r.storage?.ready!==false,storageLocked=!!r.storage?.locked;
    const windows=r.platform==="win32",locked=r.mode!=="stopped"||!!r.recoveryPending||storageLocked;
    const runtimeReady=!!runtimeCheck?.runtimeReady&&!r.migrationPending&&(!windows||(runtimeCheck.wslReady&&s.runtime==="wsl"));
    const evidence=productionCheck?.key===identity(state)&&now>=productionCheck.checkedAt&&now-productionCheck.checkedAt<60000?productionCheck:null;
    const synced=["observer","producer"].includes(r.mode)&&!!state.head?.recent&&!!state.head?.advancing&&state.peers>0;
    const walletReady=!!w.exists,backupReady=walletReady&&!!state.setup?.walletBackupSaved,keyReady=!!p.exists&&!!p.publicKey;
    const funded=!!evidence?.balances&&positive(evidence.balances.vhp),registered=keyReady&&!!evidence&&evidence.registered===p.publicKey;
    const canRegister=runtimeReady&&walletReady&&keyReady&&!state.pending&&positive(evidence?.balances?.mana);
    const canProduce=runtimeReady&&storageReady&&!storageLocked&&r.mode==="observer"&&!r.recoveryPending&&walletReady&&keyReady&&synced&&funded&&registered&&!state.pending;
    const productionMessage=r.mode==="producer"?"Block production is enabled.":state.pending?"Waiting for the submitted transaction to be irreversibly confirmed.":!runtimeCheck?"Checking runtime readiness…":!runtimeReady?"Complete runtime setup before producing blocks.":!storageReady?"Reconnect the selected chain drive.":storageLocked?"Finish the chain storage copy before producing blocks.":r.recoveryPending?"Recover the previous node process first.":r.mode!=="observer"?"Start an observer and let it catch up to the network.":!synced?"Syncing — wait for a recent, advancing head and connected peers.":!walletReady?"Create your separate Teleno wallet.":!keyReady?"Create the separate block-signing key.":!evidence?.balances?"Check readiness to verify the VHP balance.":!funded?"The selected Teleno wallet needs VHP to produce blocks.":!registered?"Check or register this signing key, then wait for confirmation.":"Ready. Review and enable block production when you choose.";
    const steps=[];
    if(windows)steps.push({id:"wsl",title:"Set up WSL2 and Ubuntu",done:!!runtimeCheck?.wslReady});
    steps.push({id:"runtime",title:windows&&(s.runtime!=="wsl"||r.migrationPending)?"Switch and install Teleno":"Install Teleno",done:runtimeReady});
    steps.push({id:"sync",title:"Start the observer",done:["observer","producer"].includes(r.mode)&&!r.recoveryPending});
    if(goal==="producer")steps.push(
      {id:"wallet",title:"Create your Teleno wallet",done:walletReady},
      {id:"wallet-backup",title:"Save your wallet backup",done:backupReady},
      {id:"key",title:"Create a block-signing key",done:keyReady});
    if(goal==="producer")steps.push(
      {id:"fund",title:"Fund your wallet and get VHP",done:funded},
      {id:"register",title:"Register your signing key",done:registered&&!state.pending},
      {id:"produce",title:"Enable block production",done:r.mode==="producer"});
    const current=steps.findIndex(step=>!step.done);
    return {goal,windows,locked,runtimeReady,storageReady,storageLocked,walletCreationBlocked:!["stopped","observer"].includes(r.mode)||!!r.recoveryPending||storageLocked,synced,walletReady,backupReady,keyReady,evidence,funded,registered,canRegister,canProduce,productionMessage,
      complete:current===-1,completed:steps.filter(step=>step.done).length,
      steps:steps.map((step,index)=>({...step,number:index+1,current:index===current}))};
  }
  return {identity,progress};
});
