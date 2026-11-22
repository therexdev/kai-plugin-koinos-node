"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pipeline}=require("node:stream/promises"),{Transform}=require("node:stream");
const {GuardedStore}=require("./guarded-store"),{safe,write}=require("./storage"),{inventory,digest}=require("./wsl-migration");
const MARKER=".kai-teleno-storage.json",networks=new Set(["mainnet","harbinger"]),hash=value=>crypto.createHash("sha256").update(value).digest("hex");
const signature=st=>({dev:st.dev,ino:st.ino}),same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
function syncFile(file,flags="r+"){const fd=fs.openSync(file,flags);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function freeBytes(file){try{const s=fs.statfsSync(file,{bigint:true});return Number(s.bavail*s.bsize);}catch{return null;}}
function existingParent(file){let at=file;while(!fs.existsSync(at)){const next=path.dirname(at);if(next===at)throw Error("Storage location is unavailable.");at=next;}return at;}
class ChainStorage {
  constructor(root,{platform=process.platform}={}){
    this.root=root;this.platform=platform;this.owner=hash(root).slice(0,20);this.store=new GuardedStore(path.join(root,"chain-storage.json"));
    this.journal=path.join(root,"chain-storage-transfer.json");this.job=null;this.task=null;this.controller=null;
  }
  syncDirectory(file){if(this.platform==="linux")syncFile(file,"r");}
  get busy(){return !!this.task;}
  get pending(){safe(this.journal,true,32768);return fs.existsSync(this.journal);}
  location(options){
    if(!networks.has(options.network))throw Error("Invalid storage network.");this.store.assert();
    const saved=this.store.get("networks."+options.network,null);
    if(!saved)return {path:path.join(this.root,"chains",options.network),custom:false};
    if(typeof saved.parent!=="string"||!path.isAbsolute(saved.parent)||saved.path!==this.target(saved.parent,options.network)||! /^[0-9a-f-]{36}$/.test(saved.generation)||!Number.isSafeInteger(saved.inode))throw Error("Saved chain location needs recovery; data was preserved.");
    return {...saved,custom:true};
  }
  target(parent,network){return path.join(parent,"Teleno",network+"-"+this.owner.slice(0,8));}
  marker(directory){const file=path.join(directory,MARKER);safe(file,true,8192);return JSON.parse(fs.readFileSync(file,"utf8"));}
  validate(directory,network,generation,inode){
    safe(directory);const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||inode!==undefined&&st.ino!==inode)throw Error("The selected chain folder changed. Reconnect its drive or choose its location again.");
    const m=this.marker(directory);if(m.schema!==1||m.owner!==this.owner||m.network!==network||m.generation!==generation)throw Error("The selected drive does not contain this Teleno chain. Data was preserved.");
    return st;
  }
  resolve(options){const value=this.location(options);if(value.custom){try{this.validate(value.path,options.network,value.generation,value.inode);}catch(error){throw Error("Chain drive unavailable. Reconnect the selected drive. "+error.message);}}else safe(value.path);return value.path;}
  info(options){
    const available=options.runtime!=="wsl";let current,ready=true,error=null,bytes=null;
    try{current=this.location(options);const file=this.resolve(options);bytes=freeBytes(existingParent(file));}catch(e){ready=false;error=e.message;current=current||{path:null,custom:false};}
    let pending=null;if(this.pending){try{const p=this.readPlan();pending={network:p.network,source:p.source,destination:p.destination};}catch(e){ready=false;error=e.message;}}
    return {supported:available,ready,path:current.path,custom:current.custom,freeBytes:bytes,error,retainedSource:current.retainedSource||null,
      pending,job:this.job,locked:this.busy||!!pending,message:available?null:"WSL2 keeps its chain inside Ubuntu. External host folders are not used for its Linux database."};
  }
  plan(options,parent){
    if(options.runtime==="wsl")throw Error("Keep WSL2 chain storage inside Ubuntu.");if(this.pending||this.busy)throw Error("Resume or finish the existing chain copy first.");
    if(typeof parent!=="string"||!path.isAbsolute(parent)||/[\0\r\n]/.test(parent))throw Error("Choose a local folder for Teleno.");
    parent=safe(path.resolve(parent));if(parent===path.parse(parent).root&&this.platform==="linux")throw Error("Choose a mounted drive or a folder, rather than the system root.");
    const st=fs.lstatSync(parent);if(!st.isDirectory()||st.isSymbolicLink())throw Error("Choose an existing local directory.");
    const current=this.location(options),destination=this.target(parent,options.network),source=current.path;
    if(destination===source){this.resolve(options);return {unchanged:true};}
    if(destination.startsWith(source+path.sep)||source.startsWith(destination+path.sep)||parent===source||parent.startsWith(source+path.sep))throw Error("Choose a folder outside the current node directory.");
    let reattach=false;
    if(fs.existsSync(destination)){
      safe(destination);if(fs.readdirSync(destination).length){if(current.custom){this.validate(destination,options.network,current.generation,current.inode);reattach=true;}else throw Error("The destination already contains files. Choose an empty location; no merge was attempted.");}
    }
    if(!reattach)this.resolve(options);
    return {schema:1,owner:this.owner,network:options.network,runtime:options.runtime,parent,parentIdentity:signature(st),source,destination,
      generation:reattach?current.generation:crypto.randomUUID(),reattach,sourceGeneration:current.generation||null,stamp:null};
  }
  readPlan(){
    safe(this.journal,true,32768);let p;try{p=JSON.parse(fs.readFileSync(this.journal,"utf8"));}catch{throw Error("The saved storage copy needs recovery. All files were preserved.");}
    if(p?.schema!==1||p.owner!==this.owner||!networks.has(p.network)||!["native","docker"].includes(p.runtime)||typeof p.parent!=="string"||!path.isAbsolute(p.parent)||p.destination!==this.target(p.parent,p.network)||typeof p.source!=="string"||!path.isAbsolute(p.source)||! /^[0-9a-f-]{36}$/.test(p.generation)||p.stamp!==null&&! /^[a-f0-9]{64}$/.test(p.stamp))throw Error("Invalid saved storage copy; all files were preserved.");return p;
  }
  begin(plan,signal){
    if(plan.unchanged)return {note:"This chain location is already selected."};if(this.busy||this.pending)throw Error("Finish the existing storage copy first.");
    write(this.journal,JSON.stringify(plan),{exclusive:true});return this.run(plan,signal);
  }
  resume(options,signal){if(this.busy)throw Error("The chain copy is already running.");const p=this.readPlan();if(p.network!==options.network||p.runtime!==options.runtime)throw Error("Select the network and runtime belonging to this saved copy.");if(fs.existsSync(path.join(p.destination,MARKER))){this.validate(p.destination,p.network,p.generation);safe(p.parent);p.parentIdentity=signature(fs.lstatSync(p.parent));write(this.journal,JSON.stringify(p));}return this.run(p,signal);}
  keepOriginal(options){if(this.busy)throw Error("Pause the copy first.");const p=this.readPlan();if(p.network!==options.network||this.location(options).path!==p.source)throw Error("The active location changed. Resume the saved operation first.");this.resolve(options);fs.rmSync(this.journal);this.syncDirectory(this.root);if(this.job){this.job.state="cancelled";this.job.error=null;this.job.phase="Original location kept";}return {note:"The original chain location is kept. The partial destination copy was preserved."};}
  run(plan,signal){
    this.controller=new AbortController();const combined=AbortSignal.any([this.controller.signal,...(signal?[signal]:[])]);
    this.job={category:"storage",action:"copy",network:plan.network,state:"running",phase:"Checking files",source:plan.source,destination:plan.destination,copiedBytes:0,totalBytes:null,startedAt:Date.now(),error:null};
    const task=Promise.resolve().then(()=>this.copy(plan,combined)).then(()=>{this.job.state="complete";this.job.phase="Storage ready";}).catch(error=>{this.job.state=combined.aborted?"paused":"failed";this.job.error=error.message;}).finally(()=>{this.job.finishedAt=Date.now();if(this.task===task)this.task=null;this.controller=null;});
    this.task=task;return {note:"Copying the node files. The node stays stopped; progress appears in Setup and Settings.",job:{...this.job}};
  }
  async cancel(){this.controller?.abort();await this.task;return {note:"The copy is paused. Original files and the partial copy were kept. Resume before starting the node."};}
  async copy(p,signal){
    const check=()=>{signal.throwIfAborted();this.store.assert();};check();
    const options={network:p.network,runtime:p.runtime},current=this.location(options);
    if(current.custom&&current.generation===p.generation&&current.path===p.destination){this.resolve(options);fs.rmSync(this.journal);return;}
    if(current.path!==p.source||(current.generation||null)!==p.sourceGeneration)throw Error("The active chain location changed. Both copies were preserved.");
    const select=()=>{check();const st=this.validate(p.destination,p.network,p.generation);this.store.set("networks."+p.network,{parent:p.parent,path:p.destination,generation:p.generation,inode:st.ino,retainedSource:p.reattach?current.retainedSource||null:fs.existsSync(p.source)?p.source:null});syncFile(this.store.file);this.syncDirectory(this.root);fs.rmSync(this.journal);this.syncDirectory(this.root);};
    if(p.reattach){this.validate(p.destination,p.network,p.generation,current.inode);select();return;}
    this.resolve(options);safe(p.parent);const parent=this.platform==="linux"?fs.openSync(p.parent,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0)|(fs.constants.O_NOFOLLOW||0)):null;let destinationFD;
    try{
      if(!same(signature(parent===null?fs.lstatSync(p.parent):fs.fstatSync(parent)),p.parentIdentity))throw Error("The chosen drive changed or was removed. Select it again after reconnecting.");
      const pinnedParent=this.platform==="linux"?`/proc/self/fd/${parent}`:p.parent;
      for(const name of ["Teleno",path.join("Teleno",p.network+"-"+this.owner.slice(0,8))]){
        const actual=path.join(p.parent,name),pinned=path.join(pinnedParent,name);try{fs.mkdirSync(pinned,{mode:0o700});}catch(e){if(e.code!=="EEXIST")throw e;}
        safe(actual);const st=fs.lstatSync(actual);if(!st.isDirectory()||this.platform==="linux"&&(st.mode&0o077))throw Error("Use a drive that supports private Linux folder permissions, such as an ext4-formatted USB drive.");
      }
      const marker=path.join(p.destination,MARKER);
      if(!fs.existsSync(marker)){if(fs.readdirSync(p.destination).length)throw Error("Destination contains unrelated files. No files were overwritten.");const pinned=path.join(pinnedParent,"Teleno",p.network+"-"+this.owner.slice(0,8),MARKER),fd=fs.openSync(pinned,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:1,owner:this.owner,network:p.network,generation:p.generation}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
      const identity=signature(this.validate(p.destination,p.network,p.generation));destinationFD=this.platform==="linux"?fs.openSync(p.destination,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0)|(fs.constants.O_NOFOLLOW||0)):null;
      if(destinationFD!==null&&!same(identity,signature(fs.fstatSync(destinationFD))))throw Error("The destination changed during selection.");
      // Pin Linux copy writes to the open drive directory. An unmount cannot
      // redirect a recursive mkdir/file open onto the Pi's system disk.
      const ioRoot=this.platform==="linux"?`/proc/self/fd/${destinationFD}`:p.destination;
      const guard=()=>{check();this.resolve(options);if(!same(identity,signature(this.validate(p.destination,p.network,p.generation))))throw Error("The destination drive changed. Copy paused with original data retained.");};
      const entries=(await inventory(p.source,signal)).filter(e=>e.path!==MARKER),stamp=hash(JSON.stringify(entries));if(p.stamp&&p.stamp!==stamp)throw Error("The source changed since the copy began. Both copies were preserved.");
      if(!p.stamp){p.stamp=stamp;write(this.journal,JSON.stringify(p));}
      const allowed=new Set([MARKER,...entries.flatMap(e=>[e.path,...(e.directory?[]:[e.path+".teleno-part"])])]);
      for(const e of await inventory(p.destination,signal))if(!allowed.has(e.path))throw Error("The destination contains unrelated files. No merge was attempted.");
      const total=entries.reduce((n,e)=>n+e.size,0);this.job.totalBytes=total;this.job.phase="Copying and verifying";
      let missing=0;for(const e of entries)if(!e.directory&&!fs.existsSync(path.join(p.destination,e.path)))missing+=e.size;
      const free=freeBytes(p.destination);if(free===null||free<missing+64*1024*1024)throw Error("Not enough verified free space on the destination. Free space and resume; both copies are retained.");
      for(const e of entries){
        guard();const from=path.join(p.source,e.path),to=path.join(ioRoot,e.path),actual=path.join(p.destination,e.path);
        if(e.directory){try{fs.mkdirSync(to,{mode:0o700});}catch(error){if(error.code!=="EEXIST")throw error;}safe(actual);continue;}
        safe(from,true,Number.MAX_SAFE_INTEGER);safe(actual,true,Number.MAX_SAFE_INTEGER);
        if(fs.existsSync(actual)){if(await digest(from,signal)!==await digest(to,signal))throw Error("An existing copied file differs. Both files were preserved.");this.job.copiedBytes+=e.size;continue;}
        const temp=to+".teleno-part";safe(actual+".teleno-part",true,Number.MAX_SAFE_INTEGER);fs.rmSync(temp,{force:true});
        const sum=crypto.createHash("sha256"),meter=new Transform({transform:(chunk,_encoding,done)=>{try{guard();sum.update(chunk);this.job.copiedBytes+=chunk.length;done(null,chunk);}catch(error){done(error);}}});
        await pipeline(fs.createReadStream(from),meter,fs.createWriteStream(temp,{flags:"wx",mode:0o600}),{signal});guard();
        if(sum.digest("hex")!==await digest(temp,signal))throw Error("Copied data failed checksum verification. Source files were retained.");syncFile(temp);fs.renameSync(temp,to);this.syncDirectory(path.dirname(to));
      }
      guard();if(hash(JSON.stringify((await inventory(p.source,signal)).filter(e=>e.path!==MARKER)))!==stamp)throw Error("The source changed during the copy. Both copies were preserved.");this.syncDirectory(ioRoot);select();
    }finally{if(destinationFD!==undefined&&destinationFD!==null)fs.closeSync(destinationFD);if(parent!==null)fs.closeSync(parent);}
  }
}
module.exports={ChainStorage,freeBytes};
