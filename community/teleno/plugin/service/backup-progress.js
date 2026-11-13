"use strict";
const {StringDecoder}=require("node:string_decoder");
const {redact}=require("./storage");
const ACTIONS=new Set(["validate","create","list","preflight","restore","bootstrap","public-list","public-fetch"]);
const PHASES=new Set(["public-restore-metadata-latest","public-restore-metadata-snapshot","public-restore-objects","public-restore-stage","restore-stage"]);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const text=(value,limit=800)=>typeof value==="string"?redact(value).slice(0,limit):"";
const snapshotId=value=>typeof value==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,150}$/.test(value)?value:null;
function summarize(value,action) {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const preflight=value.preflight||value,space=preflight.space_check,fetch=value.public_fetch||value;
  const issues=(Array.isArray(value.issues)?value.issues:[]).slice(0,20).map(i=>({severity:i.severity==="error"?"error":"note",message:text(i.message)})).filter(i=>i.message);
  const result={backupId:snapshotId(value.backup_id||value.activation?.backup_id||preflight.backup_id),issues,
    totalBytes:count(value.total_bytes??value.stage?.restored_bytes??value.object_bytes),fileCount:count(value.file_count??value.object_file_count),
    missingFiles:count(preflight.missing_object_count),availableBytes:count(space?.available_bytes??preflight.target_available_bytes),
    requiredBytes:count(preflight.restore_space?.minimum_target_free_bytes??preflight.target_minimum_free_bytes),
    spaceMessage:text(space?.message||preflight.message),downloadSkipped:text(fetch.download_skipped_reason),
    spacePassed:space?.passes_minimum??preflight.target_space_passes_minimum,
    previousData:text(value.activation?.pre_restore_dir,1024)};
  if(action==="list"||action==="public-list") {
    if(!Array.isArray(value.snapshots))return null;
    result.snapshotCount=value.snapshots.length;
    result.snapshots=value.snapshots.slice(0,100).map(s=>({id:snapshotId(s.backup_id),createdAt:text(s.source_created_at||s.created_at,80),latest:s.latest===true,complete:s.complete===true,
      bytes:count(s.total_bytes),height:count(s.source_head_height),requiredBytes:count(s.restore_space?.minimum_target_free_bytes)})).filter(s=>s.id);
    result.ok=true;
  } else if(action==="validate") {
    if(!Array.isArray(value.issues))return null;
    result.ok=!value.issues.some(i=>i.severity==="error");
  } else if(action==="public-fetch") {
    if(typeof value.ready_to_stage!=="boolean")return null;
    result.ok=value.ready_to_stage===true&&!!result.backupId;
  } else if(action==="preflight") {
    if(typeof value.ready_to_restore!=="boolean")return null;
    result.ok=value.ready_to_restore===true&&!!result.backupId;
  } else if(action==="restore"||action==="bootstrap") {
    if(typeof value.ok!=="boolean")return null;
    result.ok=value.ok===true&&!!value.activation&&!!result.backupId;
  } else if(action==="create") {
    if(!result.backupId||result.fileCount===null)return null;
    result.ok=true;
  } else return null;
  return result;
}

// The pinned CLI emits newline-delimited progress on stderr and a final JSON
// document on stdout. Keep these separate, bounded, and scoped to one process.
class BackupProgress {
  constructor(action,network,id,{now=Date.now}={}) {
    this.now=now;this.data={category:"backup",action,network,requestedId:id||"latest",backupId:null,state:"running",phase:"preparing",startedAt:now(),updatedAt:now(),progress:null,result:null};
    this.streams={stdout:{decoder:new StringDecoder("utf8"),pending:"",ended:false},stderr:{decoder:new StringDecoder("utf8"),pending:"",ended:false}};
    this.output="";this.outputBytes=0;this.outputOverflow=false;this.lastError="";this.sample=null;this.finished=false;
  }
  write(channel,chunk) {
    const stream=this.streams[channel];if(!stream||stream.ended||this.finished)return;
    this.consume(channel,stream.decoder.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
  }
  consume(channel,chunk) {
    if(channel==="stdout"&&!this.outputOverflow) {
      this.outputBytes+=Buffer.byteLength(chunk);
      if(this.outputBytes>2*1024*1024){this.output="";this.outputOverflow=true;}else this.output+=chunk;
    }
    const stream=this.streams[channel];stream.pending+=chunk;
    let newline;while((newline=stream.pending.indexOf("\n"))>=0){this.line(stream.pending.slice(0,newline));stream.pending=stream.pending.slice(newline+1);}
    if(stream.pending.length>32000)stream.pending="";
  }
  end(channel) {
    const stream=this.streams[channel];if(!stream||stream.ended)return;
    this.consume(channel,stream.decoder.end());stream.ended=true;
    if(stream.pending)this.line(stream.pending);stream.pending="";
  }
  line(line) {
    const clean=line.trim();if(clean.length>32000)return;
    if(/^Fatal:|\b(?:error|fatal)\b.*\]/i.test(clean))this.lastError=text(clean.replace(/^Fatal:\s*/i,""));
    let event;try{event=JSON.parse(clean);}catch{return;}
    if(event?.event!=="backup-progress"||!PHASES.has(event.phase))return;
    const bytes=count(event.completed_bytes),total=count(event.total_bytes),files=count(event.completed_batches),totalFiles=count(event.total_batches);
    if(bytes===null||total===null||bytes>total||files===null||totalFiles===null||files>totalFiles)return;
    const at=this.now(),previous=this.data.progress,phaseChanged=event.phase!==this.data.phase;
    let rate=phaseChanged?null:previous?.bytesPerSecond??null;
    if(!this.sample||phaseChanged||bytes<this.sample.bytes){this.sample={at,bytes};rate=null;}
    else if(at-this.sample.at>=1000){const next=(bytes-this.sample.bytes)*1000/(at-this.sample.at);rate=rate===null?next:rate*.65+next*.35;this.sample={at,bytes};}
    this.data.backupId=snapshotId(event.backup_id)||this.data.backupId;
    this.data.phase=event.phase;this.data.updatedAt=at;
    this.data.progress={completedBytes:bytes,totalBytes:total,completedFiles:files,totalFiles,attempt:count(event.attempt),bytesPerSecond:rate,
      lastByteAt:phaseChanged||bytes>(previous?.completedBytes??0)?at:previous?.lastByteAt??at};
  }
  cancel() {if(!this.finished){this.data.cancelRequested=true;this.data.state="cancelling";}}
  finish(error) {
    if(this.finished)return;
    this.end("stdout");this.end("stderr");this.finished=true;
    let result=null;
    if(!this.outputOverflow) {
      // Local snapshot creation may write startup logs before its JSON result.
      const start=this.output.search(/^\s*\{/m);
      if(start>=0)try{result=summarize(JSON.parse(this.output.slice(start)),this.data.action);}catch{}
    }
    const detail=result?.downloadSkipped||result?.issues.find(i=>i.severity==="error")?.message||(result?.ok===false?(result.spacePassed===false?result.spaceMessage:result.missingFiles>0?`The snapshot is missing ${result.missingFiles} required files. Download the snapshot before restoring it.`:""):"");
    Object.assign(this.data,{finishedAt:this.now(),result,backupId:result?.backupId||this.data.backupId});
    if(this.data.cancelRequested&&(error||!result?.ok))this.data.state="cancelled";
    else if(error||result?.ok===false){this.data.state="failed";this.data.error=detail||this.lastError||text(error?.message)||"The snapshot did not pass Teleno's checks.";}
    else if(!result){this.data.state="unverified";this.data.error="Teleno stopped, but its final result could not be read. Check the snapshot before restoring or starting the node.";}
    else this.data.state="complete";
    this.output="";this.outputBytes=0;
  }
}
module.exports={BackupProgress,ACTIONS,snapshotId,summarize};
