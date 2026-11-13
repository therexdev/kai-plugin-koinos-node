"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pipeline}=require("node:stream/promises"),{Transform}=require("node:stream");
const {safe,write}=require("./storage");
async function inventory(root,signal) {
  const result=[];
  async function walk(dir,prefix="") {
    signal?.throwIfAborted();
    for(const item of (await fs.promises.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const relative=prefix+item.name,file=path.join(dir,item.name),st=await fs.promises.lstat(file);
      if(st.isSymbolicLink()||(!st.isDirectory()&&!st.isFile()))throw Error("Unsupported file in existing Teleno data; source was preserved.");
      result.push({path:relative,directory:st.isDirectory(),size:st.isFile()?st.size:0,mtime:st.isFile()?st.mtimeMs:0});
      if(st.isDirectory())await walk(file,relative+"/");
    }
  }
  if(fs.existsSync(root)){safe(root);await walk(root);}return result;
}
async function digest(file,signal) {
  const hash=crypto.createHash("sha256");for await(const bytes of fs.createReadStream(file)){signal?.throwIfAborted();hash.update(bytes);}return hash.digest("hex");
}
async function copyChains({source,destination,journal,identity,signal,progress}) {
  safe(source);safe(destination);safe(journal,true);
  const entries=await inventory(source,signal),stamp=crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  const expected={schema:1,...identity,source,destination,stamp};
  if(fs.existsSync(journal)) {
    if(JSON.stringify(JSON.parse(fs.readFileSync(journal,"utf8")))!==JSON.stringify(expected))throw Error("Source data or WSL destination changed during migration. Both copies were preserved.");
  } else {
    if(fs.existsSync(destination)&&(await fs.promises.readdir(destination)).length)throw Error("WSL already contains node data. Existing keys and databases were preserved; no merge was attempted.");
    write(journal,JSON.stringify(expected));
  }
  await fs.promises.mkdir(destination,{recursive:true,mode:0o700});
  const bytes=entries.reduce((n,e)=>n+e.size,0),space=await fs.promises.statfs(destination);
  let missing=0;for(const entry of entries)if(!entry.directory&&!fs.existsSync(path.join(destination,entry.path)))missing+=entry.size;
  if(space.bavail*space.bsize<missing+64*1024*1024)throw Error("Not enough free Linux disk space to copy Teleno. Source and partial copy were preserved; free space and retry.");
  let copied=0;
  for(const entry of entries) {
    signal?.throwIfAborted();const from=path.join(source,entry.path),to=path.join(destination,entry.path);
    if(entry.directory){safe(to);await fs.promises.mkdir(to,{recursive:true,mode:0o700});continue;}
    safe(to,true,Number.MAX_SAFE_INTEGER);
    if(fs.existsSync(to)) {
      if(await digest(from,signal)!==await digest(to,signal))throw Error("Existing WSL file differs from the source. Both copies were preserved.");
    } else {
      const temp=to+".kai-copy-partial";safe(temp,true,Number.MAX_SAFE_INTEGER);
      await fs.promises.rm(temp,{force:true});
      const hash=crypto.createHash("sha256"),meter=new Transform({transform(chunk,_enc,callback){hash.update(chunk);callback(null,chunk);}});
      await pipeline(fs.createReadStream(from),meter,fs.createWriteStream(temp,{flags:"wx",mode:0o600}),...(signal?[{signal}]:[]));
      if(hash.digest("hex")!==await digest(temp,signal))throw Error("Copied Teleno data failed verification. Source was preserved.");
      const fd=await fs.promises.open(temp,"r+");try{await fd.sync();}finally{await fd.close();}
      await fs.promises.rename(temp,to);
    }
    copied+=entry.size;progress?.({copiedBytes:copied,totalBytes:bytes});
  }
  if(JSON.stringify(await inventory(source,signal))!==JSON.stringify(entries))throw Error("Source changed during copy. Stop the old node and review both copies before proceeding.");
  return {files:entries.filter(x=>!x.directory).length,bytes};
}
module.exports={copyChains,inventory};
