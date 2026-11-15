const CHAINS = {
  ethereum: { label:"Ethereum", rpc:process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com", explorer:"https://etherscan.io/address/" },
  solana: { label:"Solana", rpc:process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", explorer:"https://solscan.io/account/" }
};
async function rpc(url,method,params) {
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body=await response.json();
  if(body.error) throw new Error(body.error.message||"RPC request failed");
  return body.result;
}
function validAddress(chain,address) {
  if(chain==="ethereum") return /^0x[a-fA-F0-9]{40}$/.test(address);
  if(chain==="solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return false;
}
async function analyzeWallet(chain,address) {
  const config=CHAINS[chain];
  if(!config||!validAddress(chain,address)) throw new Error("Invalid address format for selected chain.");
  if(chain==="ethereum") {
    const [wei,nonce]=await Promise.all([rpc(config.rpc,"eth_getBalance",[address,"latest"]),rpc(config.rpc,"eth_getTransactionCount",[address,"latest"])]);
    return {chain:config.label,address,nativeBalance:(Number(BigInt(wei))/1e18).toFixed(8)+" ETH",activityCount:parseInt(nonce,16),explorer:config.explorer+address};
  }
  const result=await rpc(config.rpc,"getBalance",[address,{commitment:"confirmed"}]);
  return {chain:config.label,address,nativeBalance:(result.value/1e9).toFixed(9)+" SOL",activityCount:null,explorer:config.explorer+address};
}
module.exports={CHAINS,validAddress,analyzeWallet};
