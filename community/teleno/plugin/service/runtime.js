"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), net = require("node:net");
const {spawn,execFile} = require("node:child_process");
const {safe,write,redact} = require("./storage"), {generate} = require("./config");
const PIN = require("./runtime.json");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function command(file,args,{signal,timeout=30000}={}) {
  return new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,maxBuffer:4*1024*1024,signal},(e,out,err)=>e?reject(Error(redact(err || e.message))):resolve(out.trim())));
}
async function freePort(port,host) {
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",()=>reject(Error(`Port ${port} is already in use. Stop the conflicting node or choose another port in Settings.`)));server.listen(port,host,()=>server.close(resolve));});
}
class Runtime {
  constructor(root,{spawnImpl=spawn,commandImpl=command,fetchImpl=fetch,platform=process.platform,arch=process.arch}={}) {
    this.root=root;this.spawn=spawnImpl;this.command=commandImpl;this.fetch=fetchImpl;this.platform=platform;this.arch=arch;
    this.child=null;this.completion=null;this.mode="stopped";this.job=null;this.lastError=null;this.peers=null;this.peersAt=0;this.owner=hash(root).slice(0,20);
    this.binary=path.join(root,"runtime","teleno_node");this.activeOptions=null;this.network=null;
  }
  basedir(options) {return safe(path.join(this.root,"chains",options.network));}
  name(options) {return `kai-teleno-${this.owner}-${options.network}`;}
  logFile(options) {return path.join(this.root,"logs",options.network+".log");}
  support(options) {
    if (this.arch !== "x64") return {supported:false,reason:"Teleno 1.3.0 publishes x64 artifacts only. Raspberry Pi/ARM and Apple Silicon are not supported by this package."};
    if (options.runtime === "native" && this.platform !== "linux") return {supported:false,reason:"Select Docker for Windows or Intel macOS."};
    return {supported:true,reason:options.runtime === "native"?"Linux x64; GLIBC 2.38+ and libstdc++ required. Install checks the actual executable.":"Docker must be installed, running, and using Linux containers."};
  }
  async localDocker(signal) {
    if(process.env.DOCKER_HOST && !/^(unix:|npipe:)/.test(process.env.DOCKER_HOST))throw Error("Use a local Docker Desktop/Engine context; remote Docker hosts cannot manage this plugin's local data.");
    const contexts=JSON.parse(await this.command("docker",["context","inspect"],{signal}));
    const host=contexts[0]?.Endpoints?.docker?.Host;
    if(typeof host!=="string"||!/^(unix:|npipe:)/.test(host))throw Error("Select a local Docker context before using Teleno.");
    const info=JSON.parse(await this.command("docker",["info","--format","{{json .}}"],{signal}));
    if(info.OSType!=="linux"||!["x86_64","amd64"].includes(info.Architecture))throw Error("Teleno requires an x64 Docker Engine running Linux containers.");
  }
  async installed(options,signal) {
    const support=this.support(options);if(!support.supported)throw Error(support.reason);
    if(options.runtime === "native") {
      safe(this.binary,true);if(!fs.existsSync(this.binary))throw Error("Install the Teleno runtime from Overview first.");
      if(hash(fs.readFileSync(this.binary)) !== PIN.binarySha256)throw Error("Teleno executable checksum changed. Runtime was not started.");
      const version=await this.command(this.binary,["--version"],{signal});if(!version.startsWith("teleno_node 1.3.0+2c11229267cf"))throw Error("Unexpected Teleno runtime identity.");
      return version;
    }
    await this.localDocker(signal);
    const version=await this.command("docker",["run","--rm","--network","none","--pull","never",PIN.image,"--version"],{signal,timeout:60000});
    if(!version.startsWith("teleno_node 1.3.0+2c11229267cf"))throw Error("Unexpected Teleno container identity.");return version;
  }
  async install(options,signal) {
    this.idle();const support=this.support(options);if(!support.supported)throw Error(support.reason);
    if(options.runtime === "docker") {await this.localDocker(signal);await this.command("docker",["pull",PIN.image],{signal,timeout:600000});return this.installed(options,signal);}
    const dir=safe(path.join(this.root,"runtime"));fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const staging=fs.mkdtempSync(path.join(dir,"download-")),archive=path.join(staging,"runtime.tar.gz");
    try {
      let url=PIN.url, response;
      for(let n=0;n<5;n++) {
        const u=new URL(url);
        if(u.protocol!=="https:" || u.username || u.password || !["github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"].includes(u.hostname))throw Error("Unexpected runtime download host.");
        response=await this.fetch(u,{redirect:"manual",signal:AbortSignal.any([signal || new AbortController().signal,AbortSignal.timeout(120000)])});
        if([301,302,303,307,308].includes(response.status)) {url=new URL(response.headers.get("location"),url).href;await response.body?.cancel();continue;}
        break;
      }
      if(!response?.ok || !response.body)throw Error("Teleno runtime download failed.");
      const chunks=[];let bytes=0;for await(const chunk of response.body){signal?.throwIfAborted();bytes+=chunk.length;if(bytes>32*1024*1024)throw Error("Teleno download exceeds the release size limit.");chunks.push(chunk);}
      const data=Buffer.concat(chunks);if(hash(data)!==PIN.archiveSha256)throw Error("Teleno download checksum mismatch.");fs.writeFileSync(archive,data,{flag:"wx",mode:0o600});
      const entries=(await this.command("tar",["-tzf",archive],{signal})).split("\n");
      if(entries.some(p=>p.startsWith("/")||p.includes("\\")||p.split("/").includes("..")))throw Error("Unsafe runtime archive.");
      const executable=entries.filter(p=>p.endsWith("/teleno_node"));if(executable.length!==1)throw Error("Unexpected runtime archive layout.");
      await this.command("tar",["-xzf",archive,"-C",staging,executable[0]],{signal});
      const source=safe(path.join(staging,executable[0]),true);
      if(hash(fs.readFileSync(source))!==PIN.binarySha256)throw Error("Teleno executable checksum mismatch.");
      signal?.throwIfAborted();write(this.binary,fs.readFileSync(source));fs.chmodSync(this.binary,0o700);
      return await this.installed(options,signal);
    } finally {fs.rmSync(staging,{recursive:true,force:true});}
  }
  idle() {
    if(this.child)throw Error("Stop Teleno and wait for its current operation before continuing.");
    const file=path.join(this.root,"process.json");safe(file,true);
    if(fs.existsSync(file))throw Error("A previous Teleno process needs recovery. Click Stop node before starting or changing this database.");
  }
  prepare(options,producer=null) {
    const dir=this.basedir(options);fs.mkdirSync(path.join(dir,"chain"),{recursive:true,mode:0o700});
    safe(path.join(dir,"chain"));const genesis=path.join(dir,"chain/genesis_data.json");safe(genesis,true);
    const bytes=fs.readFileSync(path.join(__dirname,"assets",options.network+"-genesis.json"));
    if(!fs.existsSync(genesis))write(genesis,bytes,{exclusive:true});else if(hash(fs.readFileSync(genesis))!==hash(bytes))throw Error("Genesis data differs from the selected network; data was preserved.");
    const config=path.join(dir,"config.yml");safe(config,true);
    write(config,generate(options,dir,producer));return dir;
  }
  launchArgs(options,extra) {
    const dir=this.basedir(options),args=["--basedir",options.runtime==="docker"?"/data":dir,"--config",options.runtime==="docker"?"/data/config.yml":path.join(dir,"config.yml"),...extra];
    if(options.runtime==="native")return {file:this.binary,args};
    if(/[\r\n,]/.test(dir))throw Error("The Teleno profile path cannot contain commas or newlines with Docker.");
    return {file:"docker",args:["run","--rm","--pull","never","--name",this.name(options),"--label","kai.teleno.owner="+this.owner,
      "--mount",`type=bind,source=${dir},target=/data`,"-p",`127.0.0.1:${options.rpcPort}:${options.rpcPort}`,"-p",`${options.p2pPort}:${options.p2pPort}`,PIN.image,...args]};
  }
  append(options,line) {
    const metric=String(line).match(/\bpeer_count=(\d+)/);if(metric){this.peers=Number(metric[1]);this.peersAt=Date.now();}
    const file=this.logFile(options);safe(file,true,4*1024*1024);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024)write(file,fs.readFileSync(file).subarray(-1024*1024));
    fs.appendFileSync(file,redact(line).slice(-16000)+"\n",{mode:0o600});
  }
  launch(options,extra,mode) {
    this.idle();const spec=this.launchArgs(options,extra);
    this.lastError=null;this.peers=null;this.peersAt=0;this.activeOptions={...options};this.network=options.network;this.mode=mode;
    const child=this.spawn(spec.file,spec.args,{windowsHide:true,stdio:["ignore","pipe","pipe"]});this.child=child;
    const pidfile=path.join(this.root,"process.json");
    if(child.pid)write(pidfile,JSON.stringify({pid:child.pid,network:options.network,runtime:options.runtime,owner:this.owner}));
    for(const stream of [child.stdout,child.stderr]) {let pending="";stream?.on("data",chunk=>{pending+=chunk.toString();let p;while((p=pending.indexOf("\n"))>=0){try{this.append(options,pending.slice(0,p));}catch(e){this.lastError=redact(e.message);}pending=pending.slice(p+1);}if(pending.length>32000)pending="[oversized log line omitted]";});}
    this.completion=new Promise((resolve,reject)=>{
      let settled=false;
      const done=(error,code)=>{if(settled)return;settled=true;if(this.child===child){this.child=null;this.mode="stopped";try{safe(pidfile,true);fs.rmSync(pidfile,{force:true});}catch(e){error=error||e;}}if(error){this.lastError=redact(error.message);reject(error);}else if(code!==0){const e=Error("Teleno exited with code "+code+". See Logs; the database was preserved.");this.lastError=e.message;reject(e);}else resolve();};
      child.once("error",e=>done(e));child.once("close",code=>done(null,code));
    });this.completion.catch(()=>{});return this.completion;
  }
  async start(options,{producer=null,signal}={}) {
    this.idle();await this.installed(options,signal);signal?.throwIfAborted();
    await freePort(options.rpcPort,"127.0.0.1");await freePort(options.p2pPort,"0.0.0.0");signal?.throwIfAborted();
    this.prepare(options,producer);
    this.launch(options,producer?["--enable","block_producer","--disable","grpc"]:["--disable","block_producer","grpc"],producer?"producer":"observer");
  }
  async stop(options) {
    const chosen=this.activeOptions || options;
    if(chosen.runtime==="docker") {
      // Disposal before first use must not require Docker to be installed.
      if(!this.child&&!fs.existsSync(path.join(this.root,"process.json")))return;
      await this.localDocker();
      let info;
      try{info=JSON.parse(await this.command("docker",["inspect",this.name(chosen)],{timeout:15000}))[0];}
      catch(e){if(this.child || !/No such (object|container)/i.test(e.message))throw e;}
      if(info){
        if(info.Config?.Labels?.["kai.teleno.owner"]!==this.owner || !info.Mounts?.some(m=>m.Destination==="/data"&&path.resolve(m.Source)===path.resolve(this.basedir(chosen))))throw Error("Container ownership does not match this plugin. It was not stopped.");
        await this.command("docker",["stop","--time","45",this.name(chosen)],{timeout:60000});
      }
      if(!this.child){const file=path.join(this.root,"process.json");safe(file,true);if(fs.existsSync(file)){const r=JSON.parse(fs.readFileSync(file,"utf8"));if(r.owner!==this.owner||r.runtime!=="docker"||r.network!==chosen.network)throw Error("Saved container ownership changed; data was preserved.");fs.rmSync(file,{force:true});}}
    } else if(this.child) this.child.kill("SIGTERM");
    else {
      const file=path.join(this.root,"process.json");safe(file,true);
      if(fs.existsSync(file)) {
        const r=JSON.parse(fs.readFileSync(file,"utf8"));if(r.owner!==this.owner||r.runtime!=="native"||r.network!==chosen.network||!Number.isSafeInteger(r.pid)||r.pid<2)throw Error("Saved process ownership is invalid; preserved for recovery.");
        let args;try{args=fs.readFileSync(`/proc/${r.pid}/cmdline`,"utf8").split("\0");}catch(e){if(e.code!=="ENOENT")throw e;}
        if(args?.length>1){if(args[0]!==this.binary||args[args.indexOf("--basedir")+1]!==this.basedir(chosen)||fs.realpathSync(`/proc/${r.pid}/exe`)!==this.binary)throw Error("Previous process identity changed. No unrelated process was stopped.");process.kill(r.pid,"SIGTERM");
          const deadline=Date.now()+45000;while(fs.existsSync(`/proc/${r.pid}`)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));if(fs.existsSync(`/proc/${r.pid}`))throw Error("Previous Teleno process has not stopped; wait before restarting.");}
        fs.rmSync(file,{force:true});
      }
    }
    if(this.child){let timer;try{await Promise.race([this.completion.catch(()=>{}),new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error("Teleno has not stopped yet. Its data was preserved.")),50000);})]);}finally{clearTimeout(timer);}}
    if(this.child)throw Error("Teleno is still running.");this.mode="stopped";
  }
  async backup(options,action,id,signal) {
    this.idle();await this.installed(options,signal);signal?.throwIfAborted();this.prepare(options);
    const actions={create:"--backup-create-local",list:"--backup-list",preflight:"--backup-restore-preflight",restore:"--backup-restore",bootstrap:"--backup-public-restore"};
    if(!Object.hasOwn(actions,action))throw Error("Unsupported backup operation.");
    if(id!==undefined && (typeof id!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,150}$/.test(id)))throw Error("Invalid backup ID.");
    const args=[actions[action],"--backup-json",...(["restore","preflight"].includes(action)?["--backup-id",id || "latest"]:[])];
    this.job={action,state:"running",startedAt:Date.now()};
    const pending=this.launch(options,args,"maintenance");
    pending.then(()=>{this.job={...this.job,state:"complete",finishedAt:Date.now()};},e=>{this.job={...this.job,state:"failed",error:redact(e.message),finishedAt:Date.now()};});
    return this.job;
  }
  logs(options) {const file=this.logFile(options);safe(file,true,4*1024*1024);return fs.existsSync(file)?redact(fs.readFileSync(file,"utf8").slice(-60000)):"No Teleno logs yet.";}
  snapshot(options) {return {mode:this.mode,pid:this.child?.pid || null,peers:this.child&&Date.now()-this.peersAt<90000?this.peers:null,network:this.network,job:this.job,error:this.lastError,basedir:this.basedir(options),support:this.support(options),version:PIN.version};}
}
module.exports={Runtime,command,PIN};
