"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {safe,write}=require("./storage");
const DEFAULT_DISTRO="Ubuntu-24.04";
function validDistro(name) {
  return typeof name==="string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name) && !/^docker-desktop(?:-|$)/i.test(name);
}
function distributions(output) {
  return String(output).replace(/\0/g,"").replace(/^\uFEFF/,"").split(/\r?\n/).flatMap(line=>{
    const m=line.match(/^\s*\*?\s*(\S+)\s+.+?\s+([12])\s*$/);
    return m&&validDistro(m[1])?[{name:m[1],version:Number(m[2])}]:[];
  });
}
function hostPath(distro,linuxPath) {
  if(!validDistro(distro)||!linuxPath.startsWith("/")||path.posix.normalize(linuxPath)!==linuxPath||/[\0\r\n\\]/.test(linuxPath))throw Error("Invalid WSL storage path.");
  return `\\\\wsl.localhost\\${distro}${linuxPath.replaceAll("/","\\")}`;
}
const ENVIRONMENT=String.raw`set -eu
printf '%s\n' "$(id -un)" "$(readlink -f "$HOME")" "$(uname -m)" "$(getconf GNU_LIBC_VERSION)"
command -v python3 >/dev/null
command -v tar >/dev/null
`;
const INITIALIZE=String.raw`set -eu
umask 077
base="$1"
test "$(stat -f -c %T "$2")" != "9p" || { echo 'Use a Linux filesystem for Teleno data.' >&2; exit 1; }
part="$base"
while [ "$part" != / ]; do
  test ! -L "$part" || { echo 'Teleno storage must not contain symbolic links.' >&2; exit 1; }
  part=$(dirname "$part")
done
mkdir -p "$base/runtime" "$base/chains"
chmod 700 "$base" "$base/runtime" "$base/chains"
`;

class WslRuntime {
  constructor(root,{command,owner,hostPathImpl=hostPath}={}) {
    this.root=root;this.command=command;this.owner=owner;this.hostPath=hostPathImpl;
    this.file=path.join(root,"wsl-runtime.json");this.meta=null;
    safe(this.file,true,16384);
    if(fs.existsSync(this.file)) {
      this.meta=JSON.parse(fs.readFileSync(this.file,"utf8"));this.validate(this.meta);
    }
  }
  validate(m) {
    if(m?.schema!==1||!validDistro(m.distro)||! /^[a-z_][a-z0-9_-]{0,63}\$?$/.test(m.user||"") ||
      typeof m.home!=="string"||!m.home.startsWith("/")||m.home==="/"||m.home.startsWith("/mnt/")||/[\0\r\n\\]/.test(m.home)||path.posix.normalize(m.home)!==m.home||
      m.linuxRoot!==path.posix.join(m.home,".local/share/kai-teleno",this.owner))throw Error("WSL runtime identity is invalid. Existing data was preserved.");
  }
  ready(options) {return !!this.meta&&this.meta.distro===options.wslDistro;}
  require(options) {
    if(!this.ready(options))throw Error(`Install the native runtime for ${options.wslDistro} from Overview first.`);
    return this.meta;
  }
  paths(options) {
    const m=this.require(options),linux=path.posix.join(m.linuxRoot,"chains",options.network);
    return {linux,host:this.hostPath(m.distro,linux),binary:path.posix.join(m.linuxRoot,"runtime/teleno_node")};
  }
  spec(options,args) {
    const m=this.require(options);
    return {file:"wsl.exe",args:["--distribution",m.distro,"--user",m.user,"--exec",...args]};
  }
  exec(options,args,extra={}) {const s=this.spec(options,args);return this.command(s.file,s.args,extra);}
  async check(options,signal) {
    if(!validDistro(options.wslDistro))throw Error("Choose a regular WSL Linux distribution, not Docker Desktop.");
    let entries;
    try {entries=distributions(await this.command("wsl.exe",["--list","--verbose"],{signal,timeout:30000}));}
    catch(e){signal?.throwIfAborted();throw Error("WSL is not ready. Use Set up WSL2 in Overview, finish Ubuntu setup, restart Windows if requested, then retry. "+e.message);}
    const entry=entries.find(x=>x.name===options.wslDistro);
    if(!entry)throw Error(`${options.wslDistro} is not installed. Use Set up WSL2 in Overview, finish Ubuntu setup, then retry.`);
    if(entry.version!==2)throw Error(`${entry.name} uses WSL1. Run wsl --set-version ${entry.name} 2 in Windows Terminal, then retry.`);
    if(this.meta&&this.meta.distro!==entry.name)throw Error(`This plugin's native data belongs to ${this.meta.distro}. Select that distribution to retain its node and keys.`);
    let output;
    try {output=await this.command("wsl.exe",["--distribution",entry.name,...(this.meta?["--user",this.meta.user]:[]),"--exec","sh","-c",ENVIRONMENT],{signal,timeout:60000});}
    catch(e){signal?.throwIfAborted();throw Error(`Finish ${entry.name} setup first. Teleno needs Python 3, tar, GLIBC 2.38+ and libstdc++ (included in Ubuntu 24.04). ${e.message}`);}
    const [user,home,arch,libc]=output.trim().split(/\r?\n/),version=libc?.match(/glibc (\d+)\.(\d+)/i);
    if(arch!=="x86_64"||!version||Number(version[1])<2||(Number(version[1])===2&&Number(version[2])<38))throw Error("The pinned Teleno executable requires x64 Linux with GLIBC 2.38+. Select Ubuntu-24.04.");
    const meta={schema:1,distro:entry.name,user,home,linuxRoot:path.posix.join(home,".local/share/kai-teleno",this.owner)};
    this.validate(meta);
    if(this.meta&&JSON.stringify(meta)!==JSON.stringify(this.meta))throw Error("WSL user or storage identity changed. Existing data was preserved.");
    return meta;
  }
  async initialize(options,signal) {
    const meta=await this.check(options,signal);
    await this.command("wsl.exe",["--distribution",meta.distro,"--user",meta.user,"--exec","sh","-c",INITIALIZE,"kai-teleno",meta.linuxRoot,meta.home],{signal});
    signal?.throwIfAborted();write(this.file,JSON.stringify(meta,null,2));this.meta=meta;
    return this.paths(options);
  }
  helper(options,action,{token="",network=options.network,extra=[]}={}) {
    const m=this.require(options),code=fs.readFileSync(path.join(__dirname,"wsl-runner.txt"),"utf8");
    // Code comes from the signed plugin and is one literal argv element. No
    // shell interpolation or installed helper that can become stale on update.
    const grpc=action==="run"&&options.grpc&&!extra.some(arg=>arg.startsWith("--backup-"));
    return this.spec(options,["python3","-c",code,action,"--root",m.linuxRoot,"--owner",this.owner,"--token",token,"--network",network,...(grpc?["--grpc-port",String(options.grpcPort)]:[]),...(action==="run"?["--",...extra]:[])]);
  }
  async idle(options,signal) {const s=this.helper(options,"idle");await this.command(s.file,s.args,{signal});}
  async stop(options,record) {
    const m=this.require(options);
    const nativeFile=this.hostPath(m.distro,path.posix.join(m.linuxRoot,"native-process.json"));
    if(record&&(record.owner!==this.owner||record.runtime!=="wsl"||record.distro!==m.distro||record.linuxRoot!==m.linuxRoot||record.network!==options.network))throw Error("Saved WSL ownership changed; data preserved.");
    let token=record?.token;
    if(!token&&fs.existsSync(nativeFile)) {
      safe(nativeFile,true,16384);const native=JSON.parse(fs.readFileSync(nativeFile,"utf8"));
      if(native.owner!==this.owner||native.network!==options.network)throw Error("Native process ownership changed. Data preserved.");
      token=native.token;
    }
    if(token&&!/^[a-f0-9-]{36}$/.test(token))throw Error("Invalid WSL process token.");
    const s=this.helper(options,"stop",{token:token||""});await this.command(s.file,s.args,{timeout:60000});
  }
  launch(options,extra) {
    const token=crypto.randomUUID(),spec=this.helper(options,"run",{token,extra}),m=this.require(options);
    return {...spec,record:{token,distro:m.distro,linuxRoot:m.linuxRoot}};
  }
  binaryHost(options) {return this.hostPath(this.require(options).distro,this.paths(options).binary);}
}
module.exports={WslRuntime,DEFAULT_DISTRO,validDistro,distributions,hostPath};
