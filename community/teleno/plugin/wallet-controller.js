"use strict";
(function(root){
  function create({getState,getPage,call,run,paint,notice,units,updateTransaction}){
    const $=id=>document.getElementById(id),key=()=>JSON.stringify([getState()?.wallet.address,getState()?.settings.network]);
    let data={key:"",rows:[],cursor:null,balances:null,at:0,pages:0},pending=null,auth="wallet.unlock",dialogContext=null,maxGeneration=0;
    const context=()=>({expectedAddress:getState().wallet.address,expectedNetwork:getState().settings.network});
    function clearSecrets(){document.querySelectorAll(".wallet-dialog input[type=password]").forEach(input=>input.value="");}
    function close(dialog){maxGeneration++;clearSecrets();dialog?.close();}
    function reset(){document.querySelectorAll(".wallet-dialog[open]").forEach(close);data={key:key(),rows:[],cursor:null,balances:null,at:0,pages:0};}
    function scoped(){return data.key===key()&&getPage()==="wallet";}
    function qr(){if(!getState().wallet.address)return;try{const svg=root.KQR.svg(root.KQR.encode(getState().wallet.address,{ec:"M"}));for(const id of ["wallet-qr","wallet-qr-large"])if($(id))$(id).innerHTML=svg;}catch(error){for(const id of ["wallet-qr","wallet-qr-large"])if($(id))$(id).textContent="QR unavailable. Copy the address below.";}}
    function open(id){dialogContext=context();const dialog=$(id);if(dialog&&!dialog.open)dialog.showModal();}
    function historyDetail(row){
      let dialog=$("wallet-history-detail");if(dialog)dialog.remove();dialog=document.createElement("dialog");dialog.id="wallet-history-detail";dialog.className="wallet-dialog history-detail";
      const heading=document.createElement("div");heading.className="dialog-heading";const title=document.createElement("h2");title.textContent=row.label;const exit=document.createElement("button");exit.textContent="×";exit.setAttribute("aria-label","Close");exit.onclick=()=>dialog.close();heading.append(title,exit);dialog.append(heading);
      const dl=document.createElement("dl"),fields={Network:getState().settings.network,Status:row.status,When:row.timestamp?new Date(row.timestamp).toLocaleString():"Time unavailable",Block:row.height||"Not available",ID:row.id,...(row.counterparty?{Counterparty:row.counterparty}:{})};
      for(const [label,value]of Object.entries(fields)){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}dialog.append(dl);const copy=document.createElement("button");copy.textContent="Copy transaction ID";copy.onclick=()=>void call("util.copy",{text:row.id}).catch(e=>notice(e.message,true));dialog.append(copy);document.body.append(dialog);dialog.showModal();
    }
    function draw(){
      if(!scoped())return;for(const token of ["koin","vhp","mana"])if($("bal-"+token))$("bal-"+token).textContent=data.balances?units(data.balances[token]):"—";
      if($("wallet-balance-note"))$("wallet-balance-note").textContent=data.balancesError?(data.balances?"Saved balances · ":"Balances unavailable · ")+data.balancesError:data.balances?"Balance checked "+new Date(data.balancesAt).toLocaleTimeString():"Checking balances…";
      const host=$("wallet-history-rows");if(!host)return;host.replaceChildren();
      for(const row of data.rows){const tr=document.createElement("tr");tr.dataset.record=row.id;tr.tabIndex=0;tr.onclick=()=>historyDetail(row);tr.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();historyDetail(row);}};
        const activity=document.createElement("td"),amount=document.createElement("td"),when=document.createElement("td"),status=document.createElement("td");activity.textContent=row.label;const id=document.createElement("small");id.textContent=row.id.slice(0,14)+"…";activity.append(id);
        for(const c of row.changes){const span=document.createElement("span");span.className="wallet-row-amount";span.textContent=(c.direction==="out"?"−":"+")+units(c.amount)+" "+c.asset;span.style.color=c.direction==="out"?"#e6b9c8":"#7ee4cc";amount.append(span);}if(!row.changes.length)amount.textContent="—";
        when.textContent=row.timestamp?new Date(row.timestamp).toLocaleString():"Time unavailable";if(row.height){const block=document.createElement("small");block.textContent="#"+row.height;when.append(block);}status.textContent=row.status==="confirmed"?"Confirmed":row.status==="failed"?"Failed":"Confirming";status.className=row.status==="confirmed"?"status":"";tr.append(activity,amount,when,status);host.append(tr);
      }
      if($("wallet-history-note"))$("wallet-history-note").textContent=data.historyError?(data.rows.length?"Showing saved history · ":"History unavailable · ")+data.historyError:data.rows.length?"Select an activity for full details.":data.at?"No activity is listed for this wallet yet.":"Loading transaction history…";
      const older=document.querySelector('[data-action="wallet-older"]');if(older){older.hidden=!data.cursor;older.dataset.blocked=String(!!pending);older.disabled=!!pending;}
      updateTransaction();
    }
    function validateHistory(h){const s=getState();if(h?.address!==s.wallet.address||h.network!==s.settings.network||h.available!==true||!Array.isArray(h.rows)||h.rows.length>50)throw Error("History did not match the selected wallet and network.");for(const row of h.rows){if(!row||!/^0x1220[0-9a-f]{64}$/i.test(row.id)||typeof row.label!=="string"||!["confirmed","confirming","failed"].includes(row.status)||!Array.isArray(row.changes))throw Error("Invalid wallet history response.");for(const c of row.changes)if(!["in","out"].includes(c.direction)||!/^\d+$/.test(c.amount)||!["KOIN","tKOIN","VHP"].includes(c.asset))throw Error("Invalid wallet movement.");}return h;}
    async function load(older=false,force=false){
      if(getPage()!=="wallet"||!getState()?.wallet.exists||pending)return;if(data.key!==key())reset();if(!older&&!force&&Date.now()-data.at<30000){draw();return;}
      const captured=key(),cursor=older?data.cursor:null;if(older&&!cursor)return;
      const task=(async()=>{
        const [b,h]=await Promise.allSettled([older?Promise.resolve(null):call("wallet.balances"),call("wallet.history",cursor?{cursor}:{})]);if(captured!==key())return;
        if(!older){if(b.status==="fulfilled"&&b.value?.address===getState().wallet.address&&b.value.network===getState().settings.network){data.balances=b.value;data.balancesAt=b.value.observedAt||Date.now();data.balancesError=null;}else data.balancesError=b.status==="rejected"?b.reason.message:"Balance identity was unavailable.";}
        try{if(h.status==="rejected")throw h.reason;const value=validateHistory(h.value);data.rows=older?[...new Map([...data.rows,...value.rows].map(row=>[row.id,row])).values()]:value.rows;data.cursor=value.nextCursor||null;data.pages=older?data.pages+1:1;data.historyError=null;}catch(error){data.historyError=error.message;}
        data.at=Date.now();
      })();pending=task;draw();try{await task;}finally{if(pending===task)pending=null;draw();}
    }
    async function sendAll(){
      const dialog=$("wallet-send-dialog"),token=$("send-token").value,captured=key(),generation=++maxGeneration,button=$("send-all"),note=$("send-max-note");button.disabled=true;button.dataset.blocked="true";note.textContent="Checking maximum sendable amount…";
      try{const result=await call("wallet.maxSend",{...dialogContext,token});if(generation!==maxGeneration||captured!==key()||!dialog.open||$("send-token").value!==token)return;if(result.address!==getState().wallet.address||result.network!==getState().settings.network||result.token!==token)throw Error("Wallet or network changed. Check Send all again.");$("send-amount").value=result.amount;note.textContent=result.amountSat==="0"?"No spendable balance is available with the current mana.":result.manaLimited?"Limited by current transaction mana. The entered amount is rechecked before signing.":"Full available balance selected. Review the exact amount before sending.";}
      catch(error){if(generation===maxGeneration)note.textContent=error.message;}finally{if(generation===maxGeneration){button.dataset.blocked="false";button.disabled=false;}}
    }
    function bind(){
      document.querySelectorAll("[data-wallet-close]").forEach(b=>b.onclick=()=>close(b.closest("dialog")));document.querySelectorAll(".wallet-dialog").forEach(d=>d.oncancel=()=>{maxGeneration++;clearSecrets();});
      if($("send-all"))$("send-all").onclick=()=>void sendAll();if($("send-token"))$("send-token").onchange=()=>{maxGeneration++;$("send-amount").value="";$("send-max-note").textContent="Choose an amount or check Send all.";$("send-all").disabled=false;$("send-all").dataset.blocked="false";};
      function form(id,submit){if($(id))$(id).onsubmit=e=>{e.preventDefault();void run(async()=>{const value=submit();return await value;});};}
      form("wallet-send-form",()=>{const input={...dialogContext,password:$("send-password").value,to:$("send-to").value.trim(),amount:$("send-amount").value.trim(),token:$("send-token").value};close($("wallet-send-dialog"));return call("wallet.send",input);});
      form("wallet-burn-form",()=>{const input={...dialogContext,password:$("burn-password").value,amount:$("burn-amount").value.trim()};close($("wallet-burn-dialog"));return call("wallet.burn",input);});
      form("wallet-auth-form",()=>{const password=$("wallet-auth-password").value;close($("wallet-auth-dialog"));return call(auth,{password});});
      form("create-wallet",()=>{const password=$("new-password").value;if(password!==$("confirm-password").value)throw Error("Passwords do not match.");const wif=$("import-key").value.trim();close($("wallet-create-dialog"));return call(wif?"wallet.import":"wallet.create",{password,...(wif?{wif}:{})});});
    }
    function init(){if(data.key!==key())reset();bind();qr();draw();void load();}
    function action(name){
      if(name==="wallet-create"){open("wallet-create-dialog");return;}if(name==="wallet-send"){open("wallet-send-dialog");return;}if(name==="wallet-receive"){open("wallet-receive-dialog");return;}if(name==="wallet-burn"){open("wallet-burn-dialog");return;}
      if(name==="wallet-unlock"||name==="wallet-backup"){auth=name==="wallet-backup"?"wallet.backup":"wallet.unlock";$("wallet-auth-title").textContent=name==="wallet-backup"?"Back up wallet":"Unlock wallet";open("wallet-auth-dialog");return;}
      if(name==="wallet-older")return load(true);if(name==="wallet-refresh")return load(false,true);
    }
    function tick(){if(getPage()!=="wallet")return;if(data.key!==key()){reset();paint();return;}if(!data.pages||data.pages===1)void load();}
    return {init,action,tick,load,clearSecrets};
  }
  if(typeof module==="object"&&module.exports)module.exports={create};else root.TelenoWalletController={create};
})(globalThis);
