const {CHAINS}=require("./chain-data");
const TRANSFER_TOPIC="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const EVM=["ethereum","bsc","base","polygon","arbitrum","optimism","avalanche"];
const PRICE_IDS={bitcoin:"bitcoin",ethereum:"ethereum",solana:"solana",bsc:"binancecoin",base:"ethereum",polygon:"matic-network",arbitrum:"ethereum",optimism:"ethereum",avalanche:"avalanche-2"};
const prices={values:{},at:0};
async function json(url,options={}) {
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});
 if(!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
 return r.json();
}
async function rpc(chain,method,params){
 const c=CHAINS[chain];
 const r=await json(c.rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 if(r.error) throw new Error(r.error.message||"RPC error");
 return r.result;
}
async function getPrices(){
 if(Date.now()-prices.at<60000) return prices.values;
 const ids=[...new Set(Object.values(PRICE_IDS))].join(",");
 try{
  const p=await json("https://api.coingecko.com/api/v3/simple/price?ids="+ids+"&vs_currencies=usd");
  prices.values=p;prices.at=Date.now();
 }catch(e){console.warn("Price feed unavailable:",e.message);}
 return prices.values;
}
function usdValue(chain,amount){
 const id=PRICE_IDS[chain],price=prices.values?.[id]?.usd;
 return Number.isFinite(price)?Math.abs(amount)*price:null;
}
function norm(a){return String(a||"").toLowerCase();}
function txUrl(chain,id){
 if(chain==="bitcoin")return "https://mempool.space/tx/"+id;
 if(chain==="solana")return "https://solscan.io/tx/"+id;
 const bases={ethereum:"https://etherscan.io/tx/",bsc:"https://bscscan.com/tx/",base:"https://basescan.org/tx/",polygon:"https://polygonscan.com/tx/",arbitrum:"https://arbiscan.io/tx/",optimism:"https://optimistic.etherscan.io/tx/",avalanche:"https://snowtrace.io/tx/"};
 return (bases[chain]||"")+id;
}
async function sendAlert(client,pool,wallet,event){
 const usd=usdValue(wallet.chain,event.amount);
 const threshold=Number(wallet.min_alert_usd||0);
 if(threshold>0&&(usd===null||usd<threshold)) return;
 const guild=await pool.query("SELECT alert_channel_id FROM guilds WHERE guild_id=$1",[wallet.guild_id]);
 const channelId=guild.rows[0]?.alert_channel_id;
 if(!channelId) throw new Error("Alert channel is not configured.");
 const channel=await client.channels.fetch(channelId).catch(()=>null);
 if(!channel||!channel.isTextBased()) throw new Error("Alert destination channel is unavailable.");
 const direction=event.direction==="in"?"📥 Incoming":event.direction==="out"?"📤 Outgoing":"🔄 Activity";
 const amountText=Number(event.amount).toLocaleString("en-US",{maximumFractionDigits:8})+" "+event.symbol;
 const embed={
  color:event.direction==="in"?0x16A34A:0xD97706,
  title:`${direction} • ${CHAINS[wallet.chain].label}`,
  description:`**${amountText}**${usd===null?"":" (≈ $"+usd.toLocaleString("en-US",{maximumFractionDigits:2})+")"}`,
  fields:[
   {name:"Wallet",value:`\`${wallet.address}\``,inline:false},
   {name:"Label",value:wallet.label||"Unlabelled",inline:true},
   {name:"Transaction",value:`[View on explorer](${event.url})`,inline:true}
  ],
  footer:{text:`Source: ${event.source} • USD estimate via CoinGecko`},
  timestamp:new Date().toISOString()
 };
 await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
}
async function recordAndSend(client,pool,wallet,event){
 const key=event.id;
 const inserted=await pool.query(
  "INSERT INTO alert_events(guild_id,chain,transaction_id,event_index,event_type,payload,source_provider,source_url,observed_at,delivery_status) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,now(),'pending') ON CONFLICT DO NOTHING RETURNING id",
  [wallet.guild_id,wallet.chain,key,event.index??Number(wallet.id%2147483647),"wallet_activity",JSON.stringify({...event,amount_usd:usdValue(wallet.chain,event.amount)}),event.source,event.url]
 );
 if(!inserted.rowCount) return;
 try{
  await sendAlert(client,pool,wallet,event);
  await pool.query("UPDATE alert_events SET delivery_status=$1,delivered_at=now() WHERE id=$2",[ "delivered",inserted.rows[0].id ]);
 }catch(e){
  console.error("Alert delivery failed:",e.message);
  await pool.query("UPDATE alert_events SET delivery_status='failed' WHERE id=$1",[inserted.rows[0].id]);
 }
}
async function pollBitcoin(client,pool,wallet){
 const txs=await json(`${CHAINS.bitcoin.api}/address/${encodeURIComponent(wallet.address)}/txs`);
 if(!Array.isArray(txs)||!txs.length) return;
 const newest=txs[0].txid;
 if(!wallet.last_seen_cursor){
  await pool.query("UPDATE tracked_wallets SET last_seen_cursor=$1,last_checked_at=now() WHERE id=$2",[newest,wallet.id]);return;
 }
 const fresh=[];
 for(const tx of txs){if(tx.txid===wallet.last_seen_cursor)break;fresh.push(tx);}
 for(const tx of fresh.reverse()){
  const received=(tx.vout||[]).filter(v=>v.scriptpubkey_address===wallet.address).reduce((s,v)=>s+Number(v.value||0),0);
  const spent=(tx.vin||[]).filter(v=>v.prevout?.scriptpubkey_address===wallet.address).reduce((s,v)=>s+Number(v.prevout.value||0),0);
  const delta=(received-spent)/1e8;
  if(delta===0) continue;
  await recordAndSend(client,pool,wallet,{id:tx.txid,amount:Math.abs(delta),direction:delta>0?"in":"out",symbol:"BTC",url:txUrl("bitcoin",tx.txid),source:"mempool.space"});
 }
 await pool.query("UPDATE tracked_wallets SET last_seen_cursor=$1,last_checked_at=now() WHERE id=$2",[newest,wallet.id]);
}
async function pollSolana(client,pool,wallet){
 const sigs=await rpc("solana","getSignaturesForAddress",[wallet.address,{limit:10,commitment:"confirmed"}]);
 if(!Array.isArray(sigs)||!sigs.length) return;
 const newest=sigs[0].signature;
 if(!wallet.last_seen_cursor){await pool.query("UPDATE tracked_wallets SET last_seen_cursor=$1,last_checked_at=now() WHERE id=$2",[newest,wallet.id]);return;}
 const fresh=[];for(const s of sigs){if(s.signature===wallet.last_seen_cursor)break;if(!s.err)fresh.push(s);}
 for(const s of fresh.reverse()){
  const tx=await rpc("solana","getTransaction",[s.signature,{encoding:"jsonParsed",maxSupportedTransactionVersion:0,commitment:"confirmed"}]);
  if(!tx) continue;
  const keys=tx.transaction.message.accountKeys.map(k=>typeof k==="string"?k:k.pubkey);
  const idx=keys.indexOf(wallet.address);if(idx<0)continue;
  const delta=(Number(tx.meta.postBalances[idx])-Number(tx.meta.preBalances[idx]))/1e9;
  if(!delta)continue;
  await recordAndSend(client,pool,wallet,{id:s.signature,amount:Math.abs(delta),direction:delta>0?"in":"out",symbol:"SOL",url:txUrl("solana",s.signature),source:"Solana JSON-RPC"});
 }
 await pool.query("UPDATE tracked_wallets SET last_seen_cursor=$1,last_checked_at=now() WHERE id=$2",[newest,wallet.id]);
}
async function pollEvmChain(client,pool,chain,wallets){
 const latest=parseInt(await rpc(chain,"eth_blockNumber",[]),16);
 const state=await pool.query("SELECT last_scanned_block FROM chain_scan_state WHERE chain=$1",[chain]);
 let last=state.rowCount?Number(state.rows[0].last_scanned_block):latest;
 if(!state.rowCount){await pool.query("INSERT INTO chain_scan_state(chain,last_scanned_block) VALUES($1,$2) ON CONFLICT(chain) DO NOTHING",[chain,latest]);return;}
 const byAddress=new Map();
 for(const w of wallets){const k=norm(w.address);if(!byAddress.has(k))byAddress.set(k,[]);byAddress.get(k).push(w);}
 const end=Math.min(latest,last+10);
 for(let n=last+1;n<=end;n++){
  const block=await rpc(chain,"eth_getBlockByNumber",["0x"+n.toString(16),true]);
  if(!block)continue;
  for(const tx of block.transactions||[]){
   const from=norm(tx.from),to=norm(tx.to),value=Number(BigInt(tx.value||"0"))/1e18;
   if(value<=0)continue;
   const candidates=[...(byAddress.get(from)||[]),...(byAddress.get(to)||[])];
   for(const w of candidates){
    const direction=norm(w.address)===to?"in":"out";
    await recordAndSend(client,pool,w,{id:tx.hash,index:0,amount:value,direction,symbol:CHAINS[chain].symbol,url:txUrl(chain,tx.hash),source:"Public JSON-RPC"});
   }
  }
  await pool.query("INSERT INTO chain_scan_state(chain,last_scanned_block) VALUES($1,$2) ON CONFLICT(chain) DO UPDATE SET last_scanned_block=EXCLUDED.last_scanned_block,updated_at=now()",[chain,n]);
 }
}
async function pollOnce(client,pool){
 if(!pool)return;
 await getPrices();
 const q=await pool.query("SELECT w.* FROM tracked_wallets w JOIN guilds g ON g.guild_id=w.guild_id WHERE w.enabled=true AND g.alert_channel_id IS NOT NULL ORDER BY w.chain,w.id");
 const wallets=q.rows;
 for(const w of wallets){
  try{
   if(w.chain==="bitcoin") await pollBitcoin(client,pool,w);
   else if(w.chain==="solana") await pollSolana(client,pool,w);
  }catch(e){console.warn("Wallet poll failed",w.chain,w.address,e.message);}
 }
 for(const chain of EVM){
  const ws=wallets.filter(w=>w.chain===chain);
  if(!ws.length)continue;
  try{await pollEvmChain(client,pool,chain,ws);}catch(e){console.warn("Chain poll failed",chain,e.message);}
 }
}
function startAlertWorker(client,pool){
 if(!pool)return;
 let busy=false;
 const run=async()=>{if(busy)return;busy=true;try{await pollOnce(client,pool);}catch(e){console.error("Alert worker error:",e);}finally{busy=false;}};
 run();
 setInterval(run,Number(process.env.ALERT_POLL_INTERVAL_MS||30000));
}
module.exports={startAlertWorker};
