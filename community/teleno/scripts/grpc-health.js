"use strict";
const http2=require("node:http2"),assert=require("node:assert/strict");
module.exports=function grpcHealth(port){
  return new Promise((resolve,reject)=>{
    const session=http2.connect(`http://127.0.0.1:${port}`),chunks=[];
    let headers,trailers,done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);session.destroy();error?reject(error):resolve();};
    const timer=setTimeout(()=>finish(Error("gRPC health check timed out")),2000);session.on("error",finish);
    const request=session.request({":method":"POST",":path":"/grpc.health.v1.Health/Check","content-type":"application/grpc",te:"trailers"});
    request.on("error",finish);request.on("response",value=>headers=value);request.on("trailers",value=>trailers=value);request.on("data",chunk=>chunks.push(chunk));
    request.on("end",()=>{try{assert.equal(headers?.[":status"],200);assert.equal((trailers||headers)?.["grpc-status"],"0");assert.equal(Buffer.concat(chunks).toString("hex"),"00000000020801");finish();}catch(error){finish(error);}});
    request.end(Buffer.alloc(5));
  });
};
