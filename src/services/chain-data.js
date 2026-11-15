const CHAINS = {
  bitcoin: { label:"Bitcoin", symbol:"BTC", explorer:"https://mempool.space/address/", api:"https://mempool.space/api" },
  ethereum: { label:"Ethereum", symbol:"ETH", rpc:process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com", explorer:"https://etherscan.io/address/" },
  solana: { label:"Solana", symbol:"SOL", rpc:process.env.SOLANA_RPC_URL || "https://solana-rpc.publicnode.com", explorer:"https://solscan.io/account/" },
  bsc: { label:"BNB Smart Chain", symbol:"BNB", rpc:process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com", explorer:"https://bscscan.com/address/" },
  base: { label:"Base", symbol:"ETH", rpc:process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com", explorer:"https://basescan.org/address/" },
  polygon: { label:"Polygon", symbol:"POL", rpc:process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com", explorer:"https://polygonscan.com/address/" },
  arbitrum: { label:"Arbitrum One", symbol:"ETH", rpc:process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc", explorer:"https://arbiscan.io/address/" },
  optimism: { label:"Optimism", symbol:"ETH", rpc:process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io", explorer:"https://optimistic.etherscan.io/address/" },
  avalanche: { label:"Avalanche C-Chain", symbol:"AVAX", rpc:process.env.AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc", explorer:"https://snowtrace.io/address/" }
};
async function rpc(url,method,params) {
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body=await response.json();
  if(body.error) throw new Error(body.error.message||"RPC request failed");
  return body.result;
}
function validAddress(chain,address) {
  if(chain==="bitcoin") {
    if(address.length<14||address.length>90) return false;
    return /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
  }
  if(["ethereum","bsc","base","polygon","arbitrum","optimism","avalanche"].includes(chain)) return /^0x[a-fA-F0-9]{40}$/.test(address);
  if(chain==="solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return false;
}
async function analyzeWallet(chain,address) {
  const config=CHAINS[chain];
  if(!config||!validAddress(chain,address)) throw new Error("Invalid address format for selected chain.");
  if(chain==="bitcoin") {
    const response=await fetch(`${config.api}/address/${encodeURIComponent(address)}`,{signal:AbortSignal.timeout(12000)});
    if(!response.ok) throw new Error(`Bitcoin explorer API HTTP ${response.status}`);
    const data=await response.json(),stats=data.chain_stats||{};
    const funded=Number(stats.funded_txo_sum||0),spent=Number(stats.spent_txo_sum||0);
    return {chain:config.label,address,nativeBalance:((funded-spent)/1e8).toFixed(8)+" BTC",activityCount:Number(stats.tx_count||0),explorer:config.explorer+address};
  }
  if(chain==="solana") {
    const result=await rpc(config.rpc,"getBalance",[address,{commitment:"confirmed"}]);
    return {chain:config.label,address,nativeBalance:(result.value/1e9).toFixed(9)+" SOL",activityCount:null,explorer:config.explorer+address};
  }
  const [wei,nonce]=await Promise.all([rpc(config.rpc,"eth_getBalance",[address,"latest"]),rpc(config.rpc,"eth_getTransactionCount",[address,"latest"])]);
  return {chain:config.label,address,nativeBalance:(Number(BigInt(wei))/1e18).toFixed(8)+" "+config.symbol,activityCount:parseInt(nonce,16),explorer:config.explorer+address};
}
module.exports={CHAINS,validAddress,analyzeWallet};
