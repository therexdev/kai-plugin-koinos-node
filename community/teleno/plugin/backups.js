"use strict";
(function(root){
  const actions={validate:"Checking backup setup",create:"Creating a local snapshot",list:"Listing local snapshots",preflight:"Checking whether the snapshot can be restored",restore:"Restoring a local snapshot",bootstrap:"Restoring a public snapshot","public-list":"Finding public snapshots","public-fetch":"Downloading a public snapshot"};
  const phases={"public-restore-metadata-latest":["Finding the latest snapshot","Contacting the public snapshot server."],
    "public-restore-metadata-snapshot":["Checking snapshot details","Reading the snapshot metadata and checking its identity."],
    "public-restore-objects":["Downloading snapshot files","Files already verified in your backup folder are reused."],
    "public-restore-stage":["Restoring snapshot files","Preparing the restored database. Keep KAI open until this finishes."],
    "restore-stage":["Restoring snapshot files","Preparing the restored database. Keep KAI open until this finishes."]};
  const running=job=>job&&["running","cancelling"].includes(job.state);
  function current(state){const job=state?.runtime?.job;return job?.category==="backup"&&job.network===state.settings.network?job:null;}
  function locked(state){return state.runtime.mode!=="stopped"||state.runtime.recoveryPending||state.runtime.migrationPending||running(current(state));}
  function bytes(value){if(!Number.isFinite(value)||value<0)return "—";const units=["B","KiB","MiB","GiB","TiB"];let i=0;while(value>=1024&&i<units.length-1){value/=1024;i++;}return value.toLocaleString(undefined,{maximumFractionDigits:i?1:0})+" "+units[i];}
  function duration(ms){if(!Number.isFinite(ms)||ms<0)return "—";const seconds=Math.floor(ms/1000);if(seconds<60)return seconds+"s";if(seconds<3600)return Math.floor(seconds/60)+"m "+seconds%60+"s";return Math.floor(seconds/3600)+"h "+Math.floor(seconds%3600/60)+"m";}
  function failure(job){
    const detail=(job.error||"Teleno could not finish this operation.").split(/\s+\[(?:asio|system|generic)[.\s:]/i)[0].slice(0,240),restore=["restore","bootstrap"].includes(job.action);
    if(/resolve:|host not found|name.*resolution/i.test(detail))return {title:"Cannot reach the snapshot server",help:"Check your internet connection and try again. If the problem continues, the snapshot server may be temporarily unavailable.",detail:"The snapshot server's address could not be found."};
    if(/missing \d+ required files/i.test(detail))return {title:"Snapshot download is incomplete",help:"Download the selected public snapshot, then check it again before restoring.",detail};
    if(/(?:not enough|insufficient|no|out of).*space|disk.*full|ENOSPC/i.test(detail))return {title:"Not enough disk space",help:"Free space on the drive holding your Teleno data, then try again. On Windows this includes Ubuntu's storage. Keep your existing node and backup files.",detail};
    if(/checksum|signature|hash mismatch|network.*mismatch|chain.*identity.*(?:conflict|mismatch)/i.test(detail))return {title:"Snapshot verification failed",help:"This snapshot has not been approved for restore. Try downloading it again; Teleno will repeat its verification checks.",detail};
    if(/checkpoint identity|genesis.*(?:only|height)|irreversible.*(?:empty|zero)/i.test(detail))return {title:"The node is not ready for a local snapshot",help:"Start an observer and let it sync before creating a local snapshot. A public snapshot is available for initial setup.",detail};
    if(/http|timed? ?out|timeout|connection|resolve|network|download|transport/i.test(detail)&&!restore)return {title:"The download could not finish",help:"Check your internet connection, then retry the same snapshot. Previously verified files can be reused.",detail};
    return {title:restore?"Restore did not finish":"Backup operation did not finish",help:restore?"Keep the node stopped. Review the reason below and check the snapshot before retrying. Retain all recovery files.":"Review the reason below, then retry when the issue is resolved.",detail};
  }
  function model(state,now=Date.now()) {
    const job=current(state);if(!job)return null;
    const p=job.progress,result=job.result,active=running(job),elapsed=Math.max(0,(job.finishedAt||now)-job.startedAt);
    const measurable=active&&p?.totalBytes>0&&["public-restore-objects","public-restore-stage","restore-stage"].includes(job.phase);
    const percent=measurable?Math.min(100,100*p.completedBytes/p.totalBytes):null;
    const stale=active&&now-job.updatedAt>=20000;
    const speed=active&&!stale&&p?.bytesPerSecond>0&&now-p.lastByteAt<15000?p.bytesPerSecond:null;
    const eta=speed&&percent!==null&&percent<100&&elapsed>=5000?(p.totalBytes-p.completedBytes)/speed*1000:null;
    let [title,detail]=phases[job.phase]||[actions[job.action],"Teleno is preparing and checking the files. A percentage is not available for this stage."];
    if(measurable&&percent===100){title=job.phase==="public-restore-objects"?"Download finished · checking the snapshot":"Files prepared · finishing the restore";detail="The reported file transfer is complete. Wait for Teleno's final checks before continuing.";}
    let next=null,error=null;
    if(job.state==="cancelling"){title="Stopping the backup operation";detail="Waiting for Teleno to exit. Keep KAI open; the next action will be available when it has stopped.";}
    else if(job.state==="cancelled"){title="Operation stopped";detail=["public-fetch","public-list"].includes(job.action)?"You can retry the same snapshot. Previously verified files can be reused.":"The operation was cancelled. Check the snapshot before restoring or starting the node.";}
    else if(job.state==="failed"){error=failure(job);title=error.title;detail=error.help;}
    else if(job.state==="unverified"){title="Operation ended · result unavailable";detail=job.error;}
    else if(job.state==="complete") {
      const completed={validate:["Backup setup checked","The backup configuration passed Teleno's checks."],create:["Local snapshot created","Your chain snapshot is saved. Keep a separate offline backup of your wallet and signing key."],list:["Local snapshots listed","Choose a snapshot below, then check it before restoring."],"public-list":["Public snapshots listed","Choose a snapshot below, then download it. Listing only reads snapshot details."],preflight:["Snapshot is ready to restore","Teleno's restore checks passed. Restoring is a separate reviewed action."],"public-fetch":["Snapshot downloaded and checked","Next, restore this snapshot. Downloading alone does not update your node's database."],restore:["Snapshot restored","Next, start an observer from Overview and let it catch up. Block production remains off."],bootstrap:["Snapshot restored","Next, start an observer from Overview and let it catch up. Block production remains off."]};
      [title,detail]=completed[job.action]||["Operation complete",""];
      if(job.action==="public-fetch"&&result?.backupId)next={action:"backup-bootstrap",label:"Restore this snapshot",id:result.backupId};
      if(job.action==="preflight"&&result?.backupId)next={action:"backup-restore",label:"Restore this snapshot",id:result.backupId};
      if(["restore","bootstrap"].includes(job.action))next={action:"go-overview",label:"Go to Overview to start observer"};
    }
    return {job,active,elapsed,percent,stale,speed,eta,title,detail,next,error};
  }
  function progress(state,{button,esc},now=Date.now()) {
    const m=model(state,now);if(!m)return `<section class="card backup-progress idle"><h2>Ready when you are</h2><p>Choose Download public snapshot for a faster initial sync, or create a local snapshot of your existing node. Progress and results will appear here.</p></section>`;
    const {job,active,elapsed,percent,stale,speed,eta,title,detail,next,error}=m,p=job.progress,result=job.result,blocked=locked(state);
    const snapshot=job.backupId||job.requestedId;
    const withId=(action,label,id,kind="",disabled=false)=>button(action,label,kind,disabled).replace("<button ",`<button data-snapshot-id="${esc(id)}" `);
    let metrics=`<div><span>${active?"Elapsed":"Duration"}</span><strong>${duration(elapsed)}</strong></div>`;
    if(p?.totalBytes>0)metrics+=`<div><span>${/restore-stage/.test(job.phase)?"Files prepared":"Downloaded this operation"}</span><strong>${bytes(p.completedBytes)} / ${bytes(p.totalBytes)}</strong></div>`;
    if(active)metrics+=`<div><span>Transfer speed</span><strong>${speed?bytes(speed)+"/s":"—"}</strong></div><div><span>Estimated time left</span><strong>${eta===null?"Calculating…":"About "+duration(eta)}</strong></div>`;
    let body=`<section class="card backup-progress ${esc(job.state)}"><div class="backup-heading"><div><span class="eyebrow">${esc(actions[job.action]||"Backup operation")}</span><h2 role="status">${esc(title)}</h2></div><span class="backup-state">${job.state==="complete"?"Complete":job.state==="cancelling"?"Stopping":job.state==="cancelled"?"Stopped":active?"In progress":"Needs attention"}</span></div><p>${esc(detail)}</p><div class="backup-context"><span>${esc(job.network==="mainnet"?"Mainnet":"Harbinger testnet")}</span><span>Snapshot: <code>${esc(snapshot)}</code></span></div>`;
    if(active)body+=`<div class="backup-bar"><progress max="100" ${percent===null?"":`value="${percent}"`} aria-label="Current backup stage"></progress><strong>${percent===null?"Working…":percent.toFixed(1)+"%"}</strong></div>`;
    body+=`<div class="backup-metrics">${metrics}</div>`;
    if(active&&p?.totalFiles>0)body+=`<p class="backup-hint">${p.completedFiles.toLocaleString()} of ${p.totalFiles.toLocaleString()} ${job.phase.includes("metadata")?"metadata files read":"files verified or prepared"}${p.attempt>1?" · Attempt "+p.attempt:""}.</p>`;
    if(stale)body+=`<p class="note">Waiting for Teleno's next progress update · last update ${duration(now-job.updatedAt)} ago. Verification and disk work can take time without increasing the downloaded amount.</p>`;
    if(active)body+=`<p class="backup-hint">Keep KAI open. You can visit other plugin screens and return here. This operation will not start the node.</p>`;
    if(error)body+=`<p class="backup-error">${esc(error.detail)}</p>`;
    if(active&&job.stopError)body+=`<p class="backup-error">Stopping needs attention: ${esc(job.stopError)}. The operation may still be running.</p>`;
    if(state.runtime.recoveryPending)body+=`<p class="note">The previous process needs a verified stop before continuing. Keep the recovery files in place.</p><div class="actions">${button("stop","Stop node for recovery","danger")}</div>`;
    if(result?.availableBytes!==null&&result?.availableBytes!==undefined&&result?.requiredBytes!==null)body+=`<p class="backup-hint">Available disk space: ${bytes(result.availableBytes)} · Required for restore: ${bytes(result.requiredBytes)}</p>`;
    if(result?.issues?.length)body+=`<ul class="backup-notes">${result.issues.map(i=>`<li>${esc(i.message)}</li>`).join("")}</ul>`;
    if(result?.previousData)body+=`<p class="backup-hint">Previous node data retained at <code>${esc(result.previousData)}</code>.</p>`;
    if(next)body+=`<div class="actions">${withId(next.action,next.label,next.id||"","primary",next.action!=="go-overview"&&blocked)}</div>`;
    if(active)body+=`<div class="actions">${button("stop","Cancel operation","danger",job.state==="cancelling")}</div>`;
    else if(["failed","cancelled"].includes(job.state)&&["public-fetch","public-list","validate","list","preflight"].includes(job.action))body+=`<div class="actions">${withId("backup-"+job.action,"Retry this operation",snapshot,"",blocked)}</div>`;
    if(result?.snapshots) {
      body+=`<h3>${job.action==="public-list"?"Available public snapshots":"Local snapshot records"}</h3>`;
      if(!result.snapshots.length)body+=`<p>No snapshots were found. ${job.action==="list"?"For initial sync, use a public snapshot instead.":"Try again later or sync an observer from scratch."}</p>`;
      else body+=`<div class="backup-table"><table><thead><tr><th>Snapshot</th><th>Size / block</th><th></th></tr></thead><tbody>${result.snapshots.map(s=>`<tr><td><code>${esc(s.id)}</code>${s.latest?`<span class="backup-latest">Latest</span>`:""}<small>${esc(s.createdAt||"Date unavailable")}</small></td><td>${bytes(s.bytes)}${s.height?`<small>Block ${s.height.toLocaleString()}</small>`:""}${s.requiredBytes?`<small>Restore space: ${bytes(s.requiredBytes)}</small>`:""}</td><td><button data-backup-select="${esc(s.id)}" data-blocked="${blocked||!s.complete}" ${blocked||!s.complete?"disabled":""}>Use this snapshot</button></td></tr>`).join("")}</tbody></table></div><p class="backup-hint">A listed snapshot is not proof that all its files are downloaded. Download or check it before restoring.${result.snapshotCount>100?" Showing the first 100 snapshots.":""}</p>`;
    } else if(result?.totalBytes>0&&job.state==="complete")body+=`<p class="backup-hint">${bytes(result.totalBytes)}${result.fileCount!==null?" · "+result.fileCount.toLocaleString()+" files":""}.</p>`;
    body+=`<details id="backup-details" class="backup-details"><summary>Technical details</summary><p>Stage: <code>${esc(job.phase)}</code>. Full native diagnostics are available in Logs.</p>${job.error?`<pre>${esc(job.error)}</pre>`:""}${button("go-logs","Open detailed logs")}</details></section>`;
    return root.KaiI18n?root.KaiI18n.html(body):body;
  }
  function render(state,{button,esc},selection="latest") {
    const blocked=locked(state),r=state.runtime;
    return `<div class="page-guide-link">${button("go-overview","Back to setup guide")}</div><div id="backup-progress">${progress(state,{button,esc})}</div><section class="card"><h2>Faster initial sync</h2><p>Download a public snapshot, restore it, then start an observer to catch up. Each step is separate so you can review it before continuing.</p><ol class="backup-route"><li><strong>1. Download</strong><span>Get a checked snapshot.</span></li><li><strong>2. Restore</strong><span>Apply it to this node.</span></li><li><strong>3. Sync</strong><span>Start an observer in Overview.</span></li></ol>${r.recoveryPending?`<p class="note">A previous process needs recovery. Choose Stop node before another backup action.</p>${button("stop","Stop node","danger")}`:r.mode!=="stopped"&&r.mode!=="maintenance"?`<p class="note">Stop your running node before downloading, creating, or restoring a snapshot.</p>${button("stop","Stop node","danger")}`:""}<label>Snapshot ID<input id="backup-id" value="${esc(selection)}" maxlength="151" placeholder="latest"></label><p class="backup-hint">Keep <code>latest</code> for the newest public snapshot, or choose an exact ID from the snapshot list.</p><div class="actions">${button("backup-public-fetch","Download public snapshot","primary",blocked)}${button("backup-public-list","List public snapshots","",blocked)}${button("backup-bootstrap","Restore public bootstrap","",blocked)}</div><p class="backup-hint">Public snapshots come from the Koinos Foundation HTTPS source for this network. Allow space for downloaded files, the restored database, and retained previous data.</p></section><details id="local-backups" class="card"><summary>Local snapshots & restore checks</summary><p>Create a snapshot of your synced node, or check and restore a snapshot already in its backup folder. These actions use the Snapshot ID above.</p><div class="actions">${button("backup-create","Create local snapshot","",blocked)}${button("backup-list","List local snapshots","",blocked)}${button("backup-preflight","Check restore","",blocked)}${button("backup-restore","Restore local snapshot","",blocked)}${button("backup-validate","Validate backup setup","",blocked)}</div></details><p class="note">Chain snapshots do not back up your wallet or signing key. Regular-node Docker snapshots and Alpha chain databases cannot be imported here. Restoring retains previous data and leaves block production off.</p>`;
  }
  const api={current,locked,model,progress,render,bytes,duration};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.TelenoBackups=api;
})(globalThis);
