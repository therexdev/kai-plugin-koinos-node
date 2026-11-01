"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {WalletService}=require("./core/lib/wallet"),{ChainService}=require("./core/lib/koinos/chain");
const {WalletHistory}=require("./core/lib/koinos/wallet-history"),{GuardedStore}=require("./guarded-store");
const {runOperation,guardKoinosProvider}=require("./core/lib/koinos/operation-lifetime");
const {createProvider}=require("./core/lib/koinos-rpc"),{MAINNET_CHAIN}=require("./core/lib/koin-network/payment-network");
const {Signer}=require("koilib"),{settings:validateSettings}=require("./config");
const {Runtime}=require("./runtime"),{safe,write,redact}=require("./storage");
// Verified from the pinned release with its bundled Harbinger genesis, offline.
const HARBINGER_CHAIN="EiBncD4pKRIQWco_WRqo5Q-xnXR7JuO3PtZv983mKdKHSQ==";
function amount(value) {
  if(typeof value!=="string"||! /^(0|[1-9]\d{0,10})(\.\d{1,8})?$/.test(value))throw Error("Enter a positive amount with at most 8 decimal places.");
  const [whole,dec=""]=value.split("."),sat=BigInt(whole)*100000000n+BigInt(dec.padEnd(8,"0"));if(sat<=0n)throw Error("Amount must be positive.");return sat.toString();
}
function create(api,deps={}) {
  if(api.version!==1||api.plugin.id!=="community.teleno-node")throw Error("Teleno requires its own Foundation API v1 plugin profile.");
  fs.mkdirSync(api.plugin.dataDir,{recursive:true,mode:0o700});const st=fs.lstatSync(api.plugin.dataDir);if(!st.isDirectory()||st.isSymbolicLink())throw Error("Invalid Teleno profile.");
  const root=fs.realpathSync(api.plugin.dataDir),walletDir=safe(path.join(root,"wallet"));
  const walletFile=path.join(walletDir,"wallet.json");
  function checkWallet() {
    safe(walletFile,true,1024*1024);
    if(fs.existsSync(walletFile)){let k;try{k=JSON.parse(fs.readFileSync(walletFile,"utf8"));}catch{throw Error("Teleno wallet is unreadable; the original file was preserved.");}if(!k?.address||!k?.crypto||k.type!=="koinos-ai-keystore")throw Error("Teleno wallet needs recovery; the original file was preserved.");}
  }
  checkWallet();
  const wallet=deps.wallet||new WalletService(walletDir),electron=deps.electron||require("electron");
  const store=new GuardedStore(path.join(root,"settings.json")),journal=new GuardedStore(path.join(root,"transactions.json"));
  const lifetime=new AbortController();
  let options=validateSettings(store.get("options",{}),deps.platform||process.platform),closed=false,tail=Promise.resolve(),pending=new Set(),observer=null,disposeTask=null;
  const runtime=deps.runtime||new Runtime(root),chain=deps.chain||new ChainService({get:(key,fallback)=>key==="network"?options.network:fallback});
  const local=()=>createProvider([`http://127.0.0.1:${options.rpcPort}`],{timeoutMs:6000});
  // Testnet wallet traffic must use this plugin's port, never the regular node.
  const baseUrls=chain.rpcUrls.bind(chain);chain.rpcUrls=()=>options.network==="harbinger"?[`http://127.0.0.1:${options.rpcPort}`]:baseUrls();
  const history=new WalletHistory({chain,wallet});
  const active=signal=>{api.signal.throwIfAborted();signal?.throwIfAborted();if(closed)throw Error("Teleno is closing.");store.assert();journal.assert();checkWallet();};
  const identity=()=>JSON.stringify({address:wallet.address,options});
  const context=(signal,id)=>()=>{active(signal);if(identity()!==id)throw Error("Teleno wallet or settings changed. Review the action again.");};
  const confirm=async(title,detail,signal,id=identity())=>{active(signal);if(!await api.desktop.confirm(title,detail))throw Error("Action cancelled.");context(signal,id)();};
  const record=()=>journal.get("pending",null);
  const clearPending=()=>{if(record())throw Error("A submitted wallet transaction needs confirmation. Check it in Wallet before another transaction or settings change.");};
  const baseProvider=chain.provider.bind(chain);
  let spending=false,spendChain=null;
  chain.provider=(urls)=>{
    const provider=baseProvider(urls);
    if(!spending)return provider;
    return new Proxy(provider,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);if(typeof value!=="function")return value;
      if(key!=="sendTransaction")return value.bind(receiver);
      return async(transaction,...args)=>{
        active();clearPending();
        if(!transaction?.id||!transaction?.signatures?.length||transaction.header?.chain_id!==spendChain)throw Error("A signed transaction matching the reviewed chain identity is required.");
        journal.set("pending",{network:options.network,address:wallet.address,txId:transaction.id,transaction,createdAt:Date.now()});
        return value.call(receiver,transaction,...args);
      };
    }});
  };
  async function checkNetwork(provider=chain.provider()) {
    const chainId=await provider.getChainId();
    if(chainId!==(options.network==="mainnet"?MAINNET_CHAIN:HARBINGER_CHAIN))throw Error("RPC network identity does not match the selected network.");return chainId;
  }
  async function money(method,input,signal) {
    clearPending();const id=identity(),check=context(signal,id);const signer=wallet.signerFor(input.password);
    const publicKey=method==="producer.register"?producerKey(false).publicKey:null;
    const summary=method==="wallet.send"?`Send ${input.amount} ${input.token.toUpperCase()} from ${wallet.address} to ${input.to}.`:method==="wallet.burn"?`Burn ${input.amount} KOIN from ${wallet.address} into VHP at that same address. Burning is irreversible.`:`Register Teleno's separate block-signing key ${publicKey} for ${wallet.address}. This replaces any currently registered producer key for this address.`;
    await confirm("Review Teleno transaction",`${options.network.toUpperCase()}\n${summary}`,signal,id);
    const guarded=new Proxy(signer,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);if(typeof value!=="function")return value;return(...args)=>{if(["signHash","signTransaction","signMessage","sign","sendTransaction","getPrivateKey"].includes(key))check();return value.apply(receiver,args);};}});
    spending=true;
    try{return await runOperation(check,async()=>{spendChain=await checkNetwork();check();if(publicKey&&producerKey(false).publicKey!==publicKey)throw Error("Producer key changed during review.");let result;
      if(method==="wallet.send")result=await chain.transfer(guarded,{to:input.to,amountSat:amount(input.amount),token:input.token,assertContext:check});
      else if(method==="wallet.burn")result=await chain.burn(guarded,amount(input.amount));
      else result=await chain.registerProducerKey(guarded,publicKey);
      check();return {...result,note:"Submitted to the chain. Use Check pending transaction to verify irreversible confirmation before another spend."};
    });}finally{spending=false;spendChain=null;}
  }
  function producerKey(createKey) {
    const file=path.join(runtime.basedir(options),"block_producer/private.key");safe(file,true,1024);
    if(!fs.existsSync(file)) {
      if(!createKey)return {exists:false,publicKey:null};
      const signer=new Signer({privateKey:crypto.randomBytes(32).toString("hex")});write(file,signer.getPrivateKey("wif")+"\n",{exclusive:true});
    }
    const signer=Signer.fromWif(fs.readFileSync(file,"utf8").trim());
    return {exists:true,publicKey:Buffer.from(signer.publicKey).toString("base64url")};
  }
  async function status(signal) {
    active(signal);const base={settings:{...options},wallet:wallet.status(),runtime:runtime.snapshot(options),producer:producerKey(false),pending:record()?{txId:record().txId,network:record().network}:null};
    if(!runtime.child||runtime.mode==="maintenance")return base;
    try{
      const provider=local(),[head,chainId]=await Promise.all([provider.getHeadInfo(),checkNetwork(provider)]);active(signal);
      const height=Number(head.head_topology?.height),timestamp=Number(head.head_block_time);
      if(!Number.isSafeInteger(height)||height<0||!Number.isFinite(timestamp))throw Error("Invalid local head response.");
      const previous=observer;const advancing=!!previous&&previous.network===options.network&&previous.chainId===chainId&&height>previous.height;
      if(runtime.mode==="observer")observer={network:options.network,chainId,height,at:Date.now(),advancing:advancing||!!previous?.advancing};
      base.head={height,time:timestamp,lib:Number(head.last_irreversible_block),recent:Date.now()-timestamp<90000&&timestamp<=Date.now()+30000,advancing:observer?.advancing||false};
      base.peers=runtime.snapshot(options).peers;
    }catch(e){base.rpcError=redact(e.message);}return base;
  }
  async function reconcile(signal) {
    const r=record();if(!r)return {pending:false};
    if(r.address!==wallet.address||r.network!==options.network)throw Error("Restore the initiating wallet and network; pending transaction was preserved.");
    const p=chain.provider();await checkNetwork(p);active(signal);
    const result=await p.call("transaction_store.get_transactions_by_id",{transaction_ids:[r.txId]});active(signal);
    const tx=result?.transactions?.find(t=>t.transaction?.id===r.txId);
    if(!tx?.containing_blocks?.length)return {pending:true,txId:r.txId,note:"Not irreversibly confirmed. The saved transaction remains protected; no new payment was sent."};
    const head=await p.getHeadInfo();active(signal);
    for(const blockId of tx.containing_blocks.slice(0,8)) {
      const response=await p.call("block_store.get_blocks_by_id",{block_ids:[blockId],return_block:true,return_receipt:true});active(signal);
      const b=response?.block_items?.find(b=>b.block_id===blockId&&b.block?.id===blockId);
      if(!b?.block?.transactions?.some(t=>t.id===r.txId)||BigInt(b.block_height||b.block?.header?.height||"0")>BigInt(head.last_irreversible_block||"0"))continue;
      const receipt=b.receipt?.transaction_receipts?.find(t=>t.id===r.txId);if(!receipt)continue;
      // Verify the finalized block is on the canonical branch before release.
      const height=String(b.block_height||b.block.header.height);
      const canonical=await p.call("block_store.get_blocks_by_height",{head_block_id:head.head_topology.id,ancestor_start_height:height,num_blocks:1,return_block:false,return_receipt:false});active(signal);
      if(!canonical?.block_items?.some(item=>item.block_id===blockId))continue;
      journal.set("last",{txId:r.txId,network:r.network,reverted:receipt.reverted===true,confirmedAt:Date.now()});journal.set("pending",null);
      return {pending:false,confirmed:true,reverted:receipt.reverted===true,txId:r.txId};
    }
    return {pending:true,txId:r.txId,note:"Included but not yet irreversibly confirmed."};
  }
  async function invoke(method,input,signal) {
    active(signal);if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid Teleno input.");
    if(method==="status")return status(signal);
    if(method==="logs")return runtime.logs(options);
    if(method==="wallet.balances"){if(!wallet.address)return null;await checkNetwork();const result=await chain.balances(wallet.address);active(signal);return result;}
    if(method==="wallet.history")return history.read(input);
    if(method==="wallet.pending")return reconcile(signal);
    if(method==="producer.status")return {...producerKey(false),registered:wallet.address?await chain.registeredPublicKey(wallet.address,{strict:true}):null};
    if(method==="wallet.unlock")return wallet.unlock(input.password);
    if(method==="wallet.lock"){wallet.lock();return wallet.status();}
    if(method==="wallet.create"||method==="wallet.import") {
      runtime.idle();clearPending();if(wallet.exists())throw Error("This plugin already has a wallet. Its funds and data were preserved.");
      await confirm("Teleno wallet",`${method==="wallet.create"?"Create a new":"Import a backup for this"} separate Teleno wallet. Never reuse the KAI Core, regular node or Master node wallet.`,signal);
      if(method==="wallet.create")wallet.create({password:input.password});else wallet.importWif({password:input.password,wif:input.wif});
      return wallet.status();
    }
    if(method==="wallet.backup") {
      const result=wallet.revealWif(input.password);await confirm("Back up Teleno wallet",`Show the private backup key for ${wallet.address} in a native dialog. Store it offline.`,signal);
      const answer=await electron.dialog.showMessageBox(electron.BrowserWindow.fromId(api.desktop.hostWindowId()),{type:"warning",title:"Teleno wallet backup",message:"Keep this private key offline. Never share it.",detail:typeof result==="string"?result:result.wif,buttons:["Close","Copy private key"],defaultId:0,cancelId:0,noLink:true});active(signal);
      if(answer.response===1)electron.clipboard.writeText(typeof result==="string"?result:result.wif);return {nativeShown:true};
    }
    if(method==="wallet.send") {if(!["koin","vhp"].includes(input.token)||!chain.isValidAddress(input.to))throw Error("Choose KOIN or VHP and a valid destination address.");amount(input.amount);return money(method,input,signal);}
    if(method==="wallet.burn"){amount(input.amount);return money(method,input,signal);}
    if(method==="producer.register"){if(!producerKey(false).exists)throw Error("Create a block-signing key first.");return money(method,input,signal);}
    if(method==="producer.key") {runtime.idle();await confirm("Create Teleno block-signing key","Create a separate hot key used only to sign blocks. It is stored in this plugin's node folder with restricted file permissions. Your spending wallet stays encrypted.",signal);return producerKey(true);}
    if(method==="runtime.install"){runtime.idle();await confirm("Install Teleno 1.3.0",options.runtime==="docker"?"Download the checksum-pinned Teleno Docker image. Docker must already be running.":"Download and verify the upstream Linux x64 executable. This starts no node and spends no funds.",signal);return runtime.install(options,signal);}
    if(method==="node.start"){await confirm("Start Teleno observer",`${options.network.toUpperCase()}\nStart an observer in ${runtime.basedir(options)}. JSON-RPC stays on localhost. P2P listens on port ${options.p2pPort}. Block production remains off.`,signal);observer=null;await runtime.start(options,{signal});return runtime.snapshot(options);}
    if(method==="node.stop"){await runtime.stop(options);observer=null;return runtime.snapshot(options);}
    if(method==="producer.start") {
      clearPending();const key=producerKey(false);if(!wallet.address||!key.exists)throw Error("Create the separate wallet and block-signing key first.");
      const snapshot=await status(signal);
      if(runtime.mode!=="observer"||!snapshot.head?.recent||!snapshot.head?.advancing)throw Error("Run the observer until its head advances and reaches the current network before producing blocks.");
      const [registered,balances]=await Promise.all([chain.registeredPublicKey(wallet.address,{strict:true}),chain.balances(wallet.address)]);active(signal);
      if(registered!==key.publicKey)throw Error("Teleno's block-signing key does not match on-chain registration.");if(BigInt(balances.vhp)<=0n)throw Error("The Teleno wallet needs VHP to produce blocks.");
      if(snapshot.peers===0||snapshot.peers===null)throw Error("Wait for a connected-peer reading in Logs before enabling production.");
      await confirm("Enable Teleno block production",`${options.network.toUpperCase()}\nProducer: ${wallet.address}\nUse the registered Teleno hot key to sign blocks and consume VHP. The spending wallet may stay locked. Teleno's long-term mainnet producer behavior is still being qualified.`,signal);
      const current=await status(signal);if(!current.head?.recent||!current.head?.advancing||!current.peers||producerKey(false).publicKey!==key.publicKey)throw Error("Observer or producer key changed during review. Check the node and review again.");
      if(await chain.registeredPublicKey(wallet.address,{strict:true})!==key.publicKey)throw Error("On-chain producer registration changed during review.");active(signal);
      await runtime.stop(options);active(signal);await runtime.start(options,{producer:wallet.address,signal});observer=null;return runtime.snapshot(options);
    }
    if(method==="settings.save") {
      runtime.idle();clearPending();const next=validateSettings(input,deps.platform||process.platform);
      await confirm("Save Teleno settings",`Network: ${next.network}\nRuntime: ${next.runtime}\nRPC: localhost:${next.rpcPort}\nP2P: ${next.p2pPort}\nStart observer with KAI: ${next.autoStart?"yes":"no"}\nSettings never enable block production.`,signal);
      store.set("options",next);options=next;chain.clearCache();observer=null;return {...options};
    }
    if(method==="backup.run") {
      runtime.idle();if(!["create","list","preflight","restore","bootstrap"].includes(input.action))throw Error("Unknown backup action.");
      await confirm("Teleno backup operation",`${options.network.toUpperCase()}\n${input.action} · ${input.id||"latest"}\nFolder: ${runtime.basedir(options)}\nRestores preserve previous data under .pre-restore and require observer validation. Chain backups exclude wallet and signing keys.`,signal);
      observer=null;return runtime.backup(options,input.action,input.id,signal);
    }
    if(method==="util.copy"){if(typeof input.text!=="string"||input.text.length>100000)throw Error("Invalid clipboard text.");electron.clipboard.writeText(input.text);return true;}
    if(method==="util.open") {
      const urls={upstream:"https://github.com/koinos/teleno",release:"https://github.com/koinos/teleno/releases/tag/teleno-node-v1.3.0",docker:"https://docs.docker.com/get-started/get-docker/"};
      if(!urls[input.page])throw Error("Unknown help page.");await confirm("Open help",urls[input.page],signal);await electron.shell.openExternal(urls[input.page]);return true;
    }
    throw Error("Unknown Teleno method.");
  }
  const reads=new Set(["status","logs","wallet.balances","wallet.history","producer.status"]);
  return {
    call(method,input={},signal) {
      const frozen=structuredClone(input),combined=AbortSignal.any([api.signal,lifetime.signal,...(signal?[signal]:[])]);
      const run=()=>invoke(method,frozen,combined);
      const promise=reads.has(method)?run():tail.catch(()=>{}).then(run);
      if(!reads.has(method))tail=promise;pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;
    },
    async startBackground(){active();if(options.autoStart){try{await runtime.start(options,{signal:AbortSignal.any([api.signal,lifetime.signal])});}catch(e){runtime.lastError=redact(e.message);}}},
    async dispose(){if(disposeTask)return disposeTask;closed=true;lifetime.abort();disposeTask=(async()=>{try{await runtime.stop(options);await Promise.allSettled([...pending]);}finally{wallet.lock();}})().catch(e=>{disposeTask=null;throw e;});return disposeTask;},
  };
}
module.exports={create,amount};
