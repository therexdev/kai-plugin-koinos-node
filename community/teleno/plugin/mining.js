"use strict";
(function(root){
  function health(state,now=Date.now()) {
    const r=state.runtime,h=state.head;
    if(r.recoveryPending)return {tone:"warn",title:"Node needs recovery",detail:"Stop the previous node process before starting again."};
    if(r.mode==="maintenance")return {tone:"warn",title:"Node maintenance",detail:"Block production is paused while maintenance runs."};
    if(r.mode==="stopped")return {tone:"idle",title:"Node stopped",detail:"Start an observer to sync. Enable production separately when ready."};
    if(state.rpcError||r.error)return {tone:"warn",title:"Node needs attention",detail:state.rpcError||r.error};
    if(!h||!h.recent||now-h.time>=90000||!h.advancing||!(state.peers>0))return {tone:"warn",title:r.mode==="producer"?"Production enabled · checking progress":"Observer syncing",detail:"Waiting for a recent, advancing head and connected peers. Rewards appear after a produced block is confirmed."};
    return {tone:"good",title:r.mode==="producer"?"Production enabled · node advancing":"Observer connected · node advancing",detail:r.mode==="producer"?"The node is progressing. Confirmed account rewards are shown below; the next block is not guaranteed.":"The observer is syncing the chain. Enable production separately to produce blocks."};
  }
  function render(state,data,{esc,units,button,expanded=false},now=Date.now()) {
    const i18n=root.KaiI18n,t=value=>esc(i18n?.t?i18n.t(value):value),h=health(state,now),w=state.wallet;
    const valid=data?.address===w.address&&data?.network===state.settings.network,d=valid?data:null,m=d?.mining,totals=m?.totals,symbol=state.settings.network==="mainnet"?"KOIN":"tKOIN";
    const date=time=>Number.isSafeInteger(time)&&time>0?esc(new Date(time).toLocaleString()):t("Time unavailable");
    const metric=(label,value,note="")=>`<div class="metric"><small>${t(label)}</small><strong>${value}</strong>${note?`<span>${t(note)}</span>`:""}</div>`;
    const stale=!!(d?.error||d?.miningError||d?.stale),last=m?.feed?.find(row=>BigInt(row.reward)>0n);
    const feed=(m?.feed||[]).slice(0,expanded?40:6).map(row=>`<tr><td><strong>${BigInt(row.reward)>0n?t("Block reward"):t("Block produced")}</strong><small>#${esc(row.height)}</small></td><td class="mining-reward">+${units(row.reward)} ${symbol}<small>−${units(row.vhp)} VHP</small></td><td>${date(row.timestamp)}</td><td><span class="status">${t("Confirmed")}</span><small><code title="${esc(row.id)}">${esc(row.id.slice(0,12))}…</code></small></td></tr>`).join("");
    return `<section class="card mining-overview"><div class="mining-heading"><div><span class="eyebrow">${t("MINING / BLOCK PRODUCTION")}</span><h2>${t(h.title)}</h2></div><span class="mining-health ${h.tone}">${t(h.tone==="good"?"Live":h.tone==="warn"?"Check status":"Stopped")}</span></div><p>${t(h.detail)}</p>
      <div class="mining-wallet"><div><small>${t("Current Teleno wallet")} · ${t(w.unlocked?"Unlocked":"Locked")}</small><div class="address">${esc(w.address||"")||t("Create a Teleno wallet to track block rewards.")}</div></div>${button("go-wallet",w.exists?"Open wallet":"Set up wallet")}${w.exists?button("copy-address","Copy receive address"):""}</div>
      <div class="grid mining-metrics">${metric(symbol,d?.balances?units(d.balances.koin):"—")}${metric("VHP",d?.balances?units(d.balances.vhp):"—")}${metric("Mana",d?.balances?units(d.balances.mana):"—")}${metric("Blocks produced",totals?esc(BigInt(totals.blocks).toLocaleString()):"—",m?.syncing?"Counting older history…":"Indexed confirmed history")}${metric("Block rewards",totals?units(totals.rewards)+" "+symbol:"—")}${metric("VHP consumed",totals?units(totals.vhp):"—")}</div>
      <div class="mining-progress"><span>${t("Chain head")} <strong>${state.head?esc(state.head.height.toLocaleString()):"—"}</strong></span><span>${t("Irreversible block")} <strong>${Number.isSafeInteger(state.head?.lib)?esc(state.head.lib.toLocaleString()):"—"}</strong></span><span>${t("Peers")} <strong>${state.peers??"—"}</strong></span><span>${t("Head time")} <strong>${state.head?date(state.head.time):"—"}</strong></span></div>
      <div class="mining-history-heading"><div><h3>${t("Block & reward history")}</h3><p>${t("Latest confirmed reward")}: ${last?`+${units(last.reward)} ${symbol} · ${date(last.timestamp)}`:"—"}</p></div>${button("mining-refresh","Refresh mining details")}</div>
      ${!w.exists?`<p>${t("Mining history follows the selected wallet and network.")}</p>`:!d?`<p role="status">${t("Loading mining details…")}</p>`:stale?`<p class="mining-warning" role="status">${t("Mining history could not refresh. Previously loaded figures may be out of date.")} ${esc(d.error||d.miningError||"")}</p>`:m?.syncing?`<p role="status">${t("Loading older account history. Totals are partial until indexing finishes.")}</p>`:""}
      ${d?.balancesError?`<p class="mining-warning">${t("Balances unavailable")}: ${esc(d.balancesError)}</p>`:""}
      ${feed?`<div class="mining-table"><table><thead><tr><th>${t("Activity / block")}</th><th>${t("Reward / VHP consumed")}</th><th>${t("Block time")}</th><th>${t("Status")}</th></tr></thead><tbody>${feed}</tbody></table></div>${m.feed.length>6?`<div class="actions">${button("mining-history",expanded?"Show fewer blocks":"Show more blocks")}</div>`:""}`:m&&!stale?`<p>${t(m.syncing?"No produced blocks found in the indexed history yet.":"No confirmed produced blocks are listed for this wallet yet.")}</p>`:""}
      <p class="mining-footnote">${t("Totals use this wallet's irreversible on-chain block receipts, including blocks produced by another machine using the same wallet. Deposits and transfers are excluded. Confirmation may take time.")}</p>${d?.observedAt?`<small class="muted">${t("Last checked")}: ${date(d.observedAt)}</small>`:""}
    </section>`;
  }
  const api={health,render};if(typeof module==="object"&&module.exports)module.exports=api;else root.TelenoMining=api;
})(globalThis);
