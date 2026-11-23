"use strict";
const {normalize,tokenEvent}=require("./core/lib/koinos/wallet-history");
const {historyPage,openAccountHistory}=require("./core/lib/koinos/account-history");
const {utils}=require("koilib");
const uint=value=>typeof value==="string"&&/^(0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<(1n<<64n);
const empty=()=>({cursor:"0",blocks:"0",rewards:"0",vhp:"0",lastHeight:null,feed:[],updatedAt:null});

// Account history, scoped to this plugin's wallet and network. Only irreversible
// block receipts signed by that account contribute to mining totals. Deposits,
// transaction mints and reversible blocks never increase confirmed rewards.
class MiningStats {
  constructor({chain,wallet,state,checkNetwork,clock=Date.now}) {Object.assign(this,{chain,wallet,state,checkNetwork,clock});this.pending=null;this.cached=null;}
  async read(assertContext=()=>{}) {
    const account=this.wallet.address,network=this.chain.network().id,rpc=JSON.stringify(this.chain.rpcUrls()),key=JSON.stringify([account,network,rpc]);
    const check=()=>{assertContext();if(account!==this.wallet.address||network!==this.chain.network().id||rpc!==JSON.stringify(this.chain.rpcUrls()))throw Error("Wallet or network changed; refresh mining history.");};
    check();this.state.assert?.();
    if(!account)return {address:null,network,available:true,totals:null,feed:[],syncing:false,observedAt:this.clock()};
    if(!utils.isChecksumAddress(account))throw Error("Invalid mining wallet address.");
    if(this.cached?.key===key&&this.clock()-this.cached.value.observedAt<15000){check();return structuredClone(this.cached.value);}
    while(this.pending){const previous=this.pending;await previous.task.catch(()=>{});check();if(previous.key===key&&this.cached?.key===key)return structuredClone(this.cached.value);}
    const task=this.load(account,network,check);this.pending={key,task};
    try{const value=await task;check();this.cached={key,value};return structuredClone(value);}finally{if(this.pending?.task===task)this.pending=null;}
  }
  async load(account,network,check) {
    const {provider,chainId,latest}=await openAccountHistory({chain:this.chain,account,limit:100,irreversible:true,verify:this.checkNetwork,check});check();
    const [koin,vhp,head]=await Promise.all([provider.invokeGetContractAddress("koin"),provider.invokeGetContractAddress("vhp"),provider.getHeadInfo()]);check();
    const contracts={koin:koin?.value?.address,vhp:vhp?.value?.address},lib=String(head.last_irreversible_block);
    if(!uint(lib)||!utils.isChecksumAddress(contracts.koin)||!utils.isChecksumAddress(contracts.vhp)||contracts.koin===contracts.vhp)throw Error("Mining history could not verify native tokens or the irreversible head.");
    const stateKey=`mining.${network}.${account}`,saved=this.state.get(stateKey,null),next=saved?structuredClone(saved):empty();
    if(!next||!["cursor","blocks","rewards","vhp"].every(k=>uint(next[k]))||!(next.lastHeight===null||uint(next.lastHeight))||!Array.isArray(next.feed)||next.feed.length>40||next.feed.some(row=>!row||!/^0x1220[0-9a-f]{64}$/.test(row.id)||!["height","reward","vhp"].every(k=>uint(row[k]))||row.status!=="confirmed"||row.timestamp!==null&&(!Number.isSafeInteger(row.timestamp)||row.timestamp<=0)))throw Error("Saved mining history needs recovery; the original file was preserved.");
    const page=async(limit,ascending,seq)=>{
      const params={address:account,limit,ascending,irreversible:true,...(seq===undefined?{}:{seq_num:seq})};
      const result=await provider.call("account_history.get_account_history",params);check();
      return historyPage(result,params);
    };
    const producerBlock=entry=>{
      const row=normalize(entry,{account,contracts,chainId,tokenSymbol:network==="mainnet"?"KOIN":"tKOIN",confirmed:true});
      if(row?.kind!=="block"||entry.block.header?.signer!==account)return null;
      if(!uint(row.height)||BigInt(row.height)>BigInt(lib)||row.status==="failed")throw Error("Invalid irreversible producer block; saved totals were preserved.");
      let reward=0n,spent=0n;const seen=new Set();
      for(const event of entry.block.receipt.events||[]) {
        const mint=event.source===contracts.koin&&/^(?:token|koinos\.standards\.kcs4)\.mint_event$/.test(event.name),burn=event.source===contracts.vhp&&/^(?:token|koinos\.standards\.kcs4)\.burn_event$/.test(event.name);
        if(!mint&&!burn)continue;const fingerprint=event.sequence??JSON.stringify([event.source,event.name,event.data]);if(seen.has(fingerprint))continue;seen.add(fingerprint);
        const decoded=tokenEvent(event.data,false);if(decoded.from!==account)continue;if(mint)reward+=BigInt(decoded.amount);else spent+=BigInt(decoded.amount);
      }
      return {id:row.id,height:row.height,timestamp:row.timestamp&&row.timestamp<=this.clock()+60000?row.timestamp:null,reward:String(reward),vhp:String(spent),status:"confirmed"};
    };
    const tip=latest.length?BigInt(latest[0].seq_num):-1n,recent=latest.map(producerBlock).filter(Boolean).slice(0,40);
    if(tip+1n<BigInt(next.cursor))throw Error("Mining history moved backwards; saved totals were preserved.");
    let changed=false;
    for(let pages=0;pages<3&&BigInt(next.cursor)<=tip;pages++) {
      const entries=await page(100,true,next.cursor);if(!entries.length)throw Error("Mining history has a gap; saved totals were preserved.");
      for(const entry of entries) {
        if(BigInt(entry.seq_num)>tip)break;
        if(entry.seq_num!==next.cursor)throw Error("Mining history has a sequence gap; saved totals were preserved.");
        // Validate every receipt before advancing the durable history cursor.
        const row=producerBlock(entry);
        if(row) {
          if(next.lastHeight!==null&&BigInt(row.height)<=BigInt(next.lastHeight))throw Error("Duplicate or out-of-order irreversible producer block; saved totals were preserved.");
          next.blocks=String(BigInt(next.blocks)+1n);next.rewards=String(BigInt(next.rewards)+BigInt(row.reward));next.vhp=String(BigInt(next.vhp)+BigInt(row.vhp));next.lastHeight=row.height;
          next.feed.unshift(row);next.feed=next.feed.slice(0,40);
        }
        next.cursor=String(BigInt(entry.seq_num)+1n);changed=true;
      }
      if(entries.length<100&&BigInt(next.cursor)<=tip)throw Error("Mining history ended before its advertised latest entry.");
    }
    await this.checkNetwork(provider);check();
    if(changed){next.updatedAt=this.clock();this.state.set(stateKey,next);}
    const feed=[...new Map([...recent,...next.feed].map(row=>[row.id,row])).values()].sort((a,b)=>BigInt(a.height)>BigInt(b.height)?-1:1).slice(0,40);
    return {address:account,network,available:true,totals:{blocks:next.blocks,rewards:next.rewards,vhp:next.vhp,profit:String(BigInt(next.rewards)-BigInt(next.vhp))},feed,syncing:BigInt(next.cursor)<=tip,throughSequence:BigInt(next.cursor)?String(BigInt(next.cursor)-1n):null,latestSequence:tip>=0n?String(tip):null,observedAt:this.clock(),updatedAt:next.updatedAt};
  }
}
module.exports={MiningStats};
