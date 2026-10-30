"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"../plugin"),source=fs.readFileSync(path.join(root,"app.js"),"utf8"),html=fs.readFileSync(path.join(root,"index.html"),"utf8");
function harness(respond){
 const rows=new Map(),calls=[]; let document;
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.value="";this._text="";this.events={};this.children=[];this.classList={add(){},toggle(){}};this.ownerDocument=document;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join("");}
  set textContent(value){this._text=String(value);this.children=[];}
  setAttribute(){} removeAttribute(){} addEventListener(name,fn){this.events[name]=fn;}
  replaceChildren(...children){this._text="";this.children=children;} append(...children){this.children.push(...children);}
 }
 const operations=[...html.matchAll(/<button\b[^>]*data-operation[^>]*>/g)].map(([tag])=>tag.match(/id="([^"]+)"/)[1]);
 document={getElementById:id=>{assert.ok(rows.has(id),id);return rows.get(id);},querySelectorAll:()=>operations.map(id=>rows.get(id)),createElement:()=>new Element()};
 for(const id of html.matchAll(/\bid="([^"]+)"/g))rows.set(id[1],new Element());
 const state={network:"mainnet",networks:[{id:"mainnet",label:"Mainnet"},{id:"harbinger",label:"Harbinger"}],dataDir:"/synthetic/node/mainnet",platform:"linux",privacyMode:"online",inspectionAllowed:false,checkedAt:null,services:[],savedProducer:null};
 const context=vm.createContext({document,window:{kai:{call:async(method,input)=>{calls.push([method,input]);return respond?respond(method,input,state):state;}}},Date});
 vm.runInContext(fs.readFileSync(path.join(root,"kai-notices.js"),"utf8"),context);vm.runInContext(source,context);
 return{rows,calls,state,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test("initialization only reads node settings and leaves native actions explicit",async()=>{const h=harness();await h.flush();assert.deepEqual(h.calls.map(c=>c[0]),["node.status"]);assert.equal(h.rows.get("health").textContent,"Not checked");assert.equal(h.rows.get("resume").disabled,true);assert.equal(h.rows.get("startDocker").hidden,true);assert.equal(h.rows.get("installWsl").hidden,true);});
test("cancelled start remains stopped and tells the user",async()=>{const h=harness((m,i,s)=>m==="node.start"?{cancelled:true}:s);await h.flush();h.rows.get("start").events.click();await h.flush();assert.equal(h.calls[1][0],"node.start");assert.equal(h.calls[1][1].mode,"sync");assert.match(h.rows.get("message").textContent,/cancelled/);assert.equal(h.rows.get("health").textContent,"Not checked");});
test("logs are rendered as text and UI uses only scoped host methods",async()=>{const payload='<img src=x onerror="alert(1)">';const h=harness((m,i,s)=>m==="node.logs"?{text:payload}:{...s,inspectionAllowed:true});await h.flush();h.rows.get("logs").events.click();await h.flush();assert.equal(h.rows.get("logText").textContent,payload);assert.ok(!source.includes("innerHTML"));assert.ok(!source.includes("fetch("));assert.deepEqual(h.calls.map(c=>c[0]),["node.status","node.logs"]);});
test("manifest is sandboxed native feature scope only",()=>{const m=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));assert.equal(m.id,"kai.koinos-node");assert.equal(m.apiVersion,2);assert.deepEqual(m.permissions,["koinos-node.read","koinos-node.manage"]);for(const name of ["index.html","app.js","style.css"])assert.ok(fs.existsSync(path.join(root,name)));});

test("node workspace navigation and warning dismissal do not run native actions",async()=>{
 const h=harness((m,i,s)=>m==="node.start"?{cancelled:true}:s);await h.flush();
 h.rows.get("nav-node").events.click();assert.equal(h.rows.get("page-node").hidden,false);assert.equal(h.rows.get("page-dashboard").hidden,true);
 h.rows.get("nav-settings").events.click();assert.equal(h.rows.get("page-settings").hidden,false);assert.deepEqual(h.calls.map(c=>c[0]),["node.status"]);
 h.rows.get("start").events.click();await h.flush();const count=h.calls.length;
 h.rows.get("message").children[1].onclick();assert.equal(h.rows.get("message").hidden,true);assert.equal(h.calls.length,count);
});
