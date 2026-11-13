"use strict";
// Offline qualification of the actual upstream executable and WSL lifecycle.
// Windows: uses real wsl.exe + Ubuntu-24.04. Linux --local-transport: executes
// the same Linux commands/runner directly; does not claim Windows coverage.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict"),net=require("node:net");
const {spawn}=require("node:child_process");
const {Runtime,command}=require("../plugin/service/runtime"),{settings}=require("../plugin/service/config");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const executable=process.argv[2],local=process.argv.includes("--local-transport");
  const archiveFlag=process.argv.indexOf("--archive"),archive=archiveFlag<0?null:process.argv[archiveFlag+1];
  if(!executable||(!local&&process.platform!=="win32"))throw Error("Usage: node scripts/wsl-smoke.js /path/to/pinned/teleno_node [--local-transport on Linux]");
  for(const [network,port,id]of [["mainnet",19951,"EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA=="],["harbinger",19955,"EiBncD4pKRIQWco_WRqo5Q-xnXR7JuO3PtZv983mKdKHSQ=="]]){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"kai-wsl-smoke-")),home=path.join(root,"linux-home");fs.mkdirSync(home);
    const calls=[],translate=(file,args)=>{
      calls.push(file);assert.notEqual(file,"docker");
      if(file!=="wsl.exe")return {file,args};
      const index=args.indexOf("--exec");if(index<0)throw Error("Unexpected WSL command: "+args.join(" "));
      return {file:args[index+1],args:args.slice(index+2)};
    };
    const deps=local?{wslHostPathImpl:(_d,p)=>p,commandImpl:async(file,args,options)=>{
      if(file==="wsl.exe"&&args[0]==="--list"){calls.push(file);return "Ubuntu-24.04 Running 2";}
      const s=translate(file,args);const result=await command(s.file,s.args,options);
      if(s.file==="sh"&&s.args[0]==="-c"&&s.args[1].includes("$(id -un)")){const lines=result.split("\n");lines[1]=home;return lines.join("\n");}return result;
    },spawnImpl:(file,args,options)=>{const s=translate(file,args);return spawn(s.file,s.args,options);}}:{};
    const r=new Runtime(root,{platform:"win32",arch:"x64",...deps,...(archive?{fetchImpl:async()=>new Response(fs.readFileSync(archive))}:{})}),s=settings({network,rpcPort:port,p2pPort:port+1,grpc:true,grpcPort:port+2},"win32");
    const rpc=async()=>{const response=await fetch(`http://127.0.0.1:${port}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"chain.get_chain_id",params:{}}),signal:AbortSignal.timeout(2000)});return (await response.json()).result?.chain_id;};
    async function ready(){for(let i=0;i<100;i++){if(!r.child)throw Error(r.lastError);try{if(await rpc()===id&&/teleno_node ready/.test(r.logs(s)))return;}catch{}await pause(100);}throw Error("Observer did not become ready");}
    try{
      if(archive)await r.install(s);
      else {await r.wsl.initialize(s);fs.copyFileSync(executable,r.wsl.binaryHost(s));await r.wsl.exec(s,["chmod","700",r.wsl.paths(s).binary]);}
      await r.installed(s);r.prepare(s);
      for(let restart=0;restart<2;restart++){
        r.launch(s,["--disable","block_producer","p2p"],"observer");await ready();assert.equal(await rpc(),id);
        await new Promise((resolve,reject)=>{const socket=net.connect(s.grpcPort,"127.0.0.1");socket.once("connect",()=>{socket.end();resolve();});socket.once("error",reject);});
        await assert.rejects(r.wsl.idle(s),/already using/);
        // Recovery must refuse a reused PID/changed process identity.
        const recordPath=r.wsl.hostPath(s.wslDistro,path.posix.join(r.wsl.meta.linuxRoot,"native-process.json"));
        const record=fs.readFileSync(recordPath,"utf8"),changed=JSON.parse(record);changed.start="wrong-start-time";fs.writeFileSync(recordPath,JSON.stringify(changed));
        await assert.rejects(r.stop(s),/identity changed/);assert.equal(await rpc(),id);fs.writeFileSync(recordPath,record);
        await r.stop(s);assert.equal(r.child,null);assert.equal(fs.existsSync(path.join(root,"process.json")),false);
      }
      if(local){
        r.launch(s,["--disable","block_producer","p2p"],"observer");await ready();r.child.kill("SIGKILL");await assert.rejects(r.completion,/exited/);
        assert.equal(await rpc(),id);assert.ok(fs.existsSync(path.join(root,"process.json")));await r.stop(s);assert.equal(fs.existsSync(path.join(root,"process.json")),false);
      }
      // Immediate Stop must cancel an in-flight launch, not leave an orphan.
      r.launch(s,["--disable","block_producer","p2p"],"observer");await r.stop(s);assert.equal(r.child,null);
      for(const action of ["validate","list"]){await r.backup(s,action);await r.completion;assert.equal(r.job.state,"complete");}
      await r.backup(s,"create");await assert.rejects(r.completion,/exited/);assert.equal(r.job.state,"failed");await r.stop(s);
      assert.ok(fs.existsSync(path.join(r.basedir(s),"db")));assert.equal(calls.includes("docker"),false);
      console.log(`${network}: ${local?"Linux transport simulation":"actual Windows WSL2"}; exact binary, RPC/gRPC, clean reopen, process ownership, cancellation, backup validation/list/refusal passed`);
    }catch(e){console.error(r.logs(s).slice(-6000));throw e;}
    finally{
      await r.stop(s);
      if(!local&&r.wsl.meta){
        // Delete only this script's unique test profile, after verified shutdown.
        await r.wsl.exec(s,["rm","-rf","--",r.wsl.meta.linuxRoot]);
      }
      fs.rmSync(root,{recursive:true,force:true});
    }
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
