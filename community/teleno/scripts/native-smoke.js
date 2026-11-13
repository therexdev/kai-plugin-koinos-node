"use strict";
// Runs the pinned executable against temporary, offline databases only.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict");
const {Runtime}=require("../plugin/service/runtime"),{settings}=require("../plugin/service/config");
async function main(){
  const executable=process.argv[2];if(!executable)throw Error("Usage: node scripts/native-smoke.js /path/to/pinned/teleno_node");
  for(const [network,port,id]of [["mainnet",19851,"EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA=="],["harbinger",19853,"EiBncD4pKRIQWco_WRqo5Q-xnXR7JuO3PtZv983mKdKHSQ=="]]){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"kai-teleno-native-")),r=new Runtime(root),s=settings({network,rpcPort:port,p2pPort:port+1});
    fs.mkdirSync(path.dirname(r.binary));fs.copyFileSync(executable,r.binary);fs.chmodSync(r.binary,0o700);
    try{
      await r.installed(s);r.prepare(s);
      const dry=JSON.parse(await r.command(r.binary,["--basedir",r.basedir(s),"--config",path.join(r.basedir(s),"config.yml"),"--backup-dry-run","--backup-json"]));assert.equal(dry.issues.some(i=>i.severity==="error"),false);
      for(let restart=0;restart<2;restart++){
        r.launch(s,["--disable","block_producer","grpc","p2p"],"observer");let answer;
        for(let i=0;i<50;i++){await new Promise(resolve=>setTimeout(resolve,100));if(!r.child)throw Error(r.lastError);try{const response=await fetch(`http://127.0.0.1:${port}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"chain.get_chain_id",params:{}})});answer=await response.json();if(answer.result && /teleno_node ready/.test(r.logs(s)))break;}catch{}}
        assert.equal(answer?.result?.chain_id,id);assert.match(r.logs(s),/teleno_node ready/);await r.stop(s);assert.equal(r.child,null);
      }
      await r.backup(s,"list");await r.completion;assert.equal(r.job.state,"complete");assert.deepEqual(r.job.result.snapshots,[]);
      // Genesis-only chains cannot produce a meaningful native checkpoint.
      // Preserve the real upstream refusal rather than claiming a backup exists.
      await r.backup(s,"create");await assert.rejects(r.completion,/exited/);assert.equal(r.job.state,"failed");assert.match(r.job.error,/checkpoint identity/);assert.ok(fs.existsSync(path.join(r.basedir(s),"db")));assert.match(r.logs(s),/checkpoint identity/);
      console.log(network+": exact runtime, offline RPC identity, clean stop/reopen, backup config/list and genesis-only backup refusal passed");
    }catch(e){console.error(r.logs(s).slice(-5000));throw e;}finally{await r.stop(s);fs.rmSync(root,{recursive:true,force:true});}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
