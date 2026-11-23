"use strict";
(function(root){
  function panel(state,g,{esc,button}){
    const active=state.runtime.mode==="producer";
    return `<section class="card production-panel" aria-label="Block production"><div><span class="eyebrow">BLOCK PRODUCTION</span><h2>${active?"Production is active":g.canProduce?"Ready to produce blocks":"Prepare block production"}</h2><p role="status">${esc(g.productionMessage)}</p></div><div class="actions">${button("go-producer",active?"Production details":"Production setup")}${active?"":button("produce","Enable block production","primary",!g.canProduce)}</div></section>`;
  }
  function checks(state,g,{esc,units}){
    const balances=g.evidence?.balances;
    const rows=[
      ["Runtime",g.runtimeReady?"Installed":"Check runtime setup",g.runtimeReady],
      ["Chain storage",g.storageReady?(g.storageLocked?"Copy must finish":"Ready"):"Drive unavailable",g.storageReady&&!g.storageLocked],
      ["Observer sync",g.synced?"Current head, advancing, peers connected":["observer","producer"].includes(state.runtime.mode)?"Syncing — wait for a recent, advancing head and connected peers":"Start an observer",g.synced],
      ["Wallet",g.walletReady?state.wallet.address:"Create your Teleno wallet",g.walletReady],
      ["Signing key",g.keyReady?"Created":"Create a separate block-signing key",g.keyReady],
      ["VHP",balances?units(balances.vhp)+" VHP":g.evidence?.balancesError?"Balance unavailable: "+g.evidence.balancesError:"Not verified yet",g.funded],
      ["Registration",g.registered?"Matches this signing key":g.evidence?.registrationError?"Could not verify: "+g.evidence.registrationError:"Check or register this signing key",g.registered],
      ["Transactions",state.pending?"Waiting for irreversible confirmation":"None pending",!state.pending]
    ];
    return rows.map(([name,value,ready])=>`<div><dt>${esc(name)}</dt><dd class="${ready?"status":"muted"}">${esc(value)}</dd></div>`).join("");
  }
  function page(state,g,ui){
    const {esc,button,password}=ui,active=state.runtime.mode==="producer";
    return `<div class="page-guide-link">${button("go-setup","Back to Setup")}</div><section class="card production-page"><span class="eyebrow">BLOCK PRODUCTION</span><h2>${active?"Block production is enabled":"Enable block production"}</h2><p id="producer-readiness" class="note" role="status">${esc(g.productionMessage)}</p><div class="actions">${button("produce","Enable block production","primary",!g.canProduce)}${button("producer-check","Check readiness")}${button("stop","Stop node","danger",!g.locked)}</div><p class="hint">Keep the observer running while it syncs. Once ready, enabling production requires a separate native review. It consumes VHP; wallet locking keeps an active producer running.</p><dl id="producer-checks" class="production-checks">${checks(state,g,ui)}</dl><div class="actions">${button("go-wallet",g.walletReady?"Open wallet":"Create / restore wallet")}${g.walletReady?button("go-backup",g.backupReady?"Wallet backup":"Back up wallet"):""}${button("go-logs","View sync logs")}</div><details class="producer-key-details" open><summary>Signing key and registration</summary><h3>Block-signing public key</h3><code id="producer-key">${esc(state.producer.publicKey||"Not created")}</code><p id="producer-registration" class="muted"></p><div class="actions">${button("key","Create block-signing key","",g.walletCreationBlocked||!g.runtimeReady||!g.storageReady||g.keyReady)}</div><p>Register this separate hot key using your Teleno wallet. Back up the spending wallet before funding it. The wallet password is required for registration.</p>${password("producer-password")}<div class="actions">${button("register","Review key registration","",!g.canRegister)}</div></details></section>`;
  }
  const api={panel,page,checks};if(typeof module==="object"&&module.exports)module.exports=api;else root.TelenoProduction=api;
})(globalThis);
