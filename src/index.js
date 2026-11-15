require("dotenv").config();
const {Client,GatewayIntentBits,EmbedBuilder}=require("discord.js");
const {Pool}=require("pg");
const {validAddress,analyzeWallet}=require("./services/chain-data");
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="false"?false:{rejectUnauthorized:false},max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:8000}):null;
async function ensureGuild(guild){
 if(!pool) throw new Error("Wallet watchlist needs DATABASE_URL. Configure PostgreSQL and apply db/schema.sql first.");
 await pool.query("INSERT INTO guilds(guild_id,name) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET name=EXCLUDED.name,updated_at=now()",[guild.id,guild.name]);
}
const errorEmbed=m=>new EmbedBuilder().setColor(0xD97706).setTitle("TERA ON-CHAIN").setDescription(m);
client.once("ready",()=>console.log(`TERA ON-CHAIN online as ${client.user.tag}`));
client.on("interactionCreate",async i=>{
 if(!i.isChatInputCommand()) return;
 await i.deferReply({ephemeral:i.commandName==="wallet"&&i.options.getSubcommand()!=="analyze"});
 try{
  if(i.commandName==="onchain"){
   const e=new EmbedBuilder().setColor(0x16A34A).setTitle("TERA ON-CHAIN").setDescription("Read-only blockchain intelligence. No private keys, signing, custody or trading.")
    .addFields({name:"Live RPC",value:"Ethereum • Solana",inline:true},{name:"Wallet analysis",value:"Available",inline:true},{name:"Wallet watchlist",value:pool?"PostgreSQL configured":"Database not configured",inline:true},{name:"Whale feed / Token risk",value:"Indexer integration pending — no fabricated results."})
    .setFooter({text:"MVP • Public blockchain data only"});
   return i.editReply({embeds:[e]});
  }
  if(i.commandName==="wallet"){
   const sub=i.options.getSubcommand();
   if(sub==="analyze"){
    const chain=i.options.getString("chain"),address=i.options.getString("address").trim(),d=await analyzeWallet(chain,address);
    const e=new EmbedBuilder().setColor(0x2563EB).setTitle("Wallet analysis").setURL(d.explorer)
     .addFields({name:"Network",value:d.chain,inline:true},{name:"Native balance",value:d.nativeBalance,inline:true},{name:"Nonce / signatures",value:d.activityCount===null?"Not returned by this RPC":String(d.activityCount),inline:true},{name:"Address",value:`\`${d.address}\``})
     .setDescription("Live public RPC snapshot. Not a complete wallet history or identity attribution.")
     .setFooter({text:"Source: public RPC • Click title for explorer"});
    return i.editReply({embeds:[e]});
   }
   await ensureGuild(i.guild);
   if(sub==="watch-add"){
    const chain=i.options.getString("chain"),address=i.options.getString("address").trim(),label=i.options.getString("label")||null;
    if(!validAddress(chain,address)) throw new Error("Invalid wallet address for selected chain.");
    await pool.query("INSERT INTO tracked_wallets(guild_id,chain,address,label,added_by_user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,chain,address) DO UPDATE SET label=EXCLUDED.label,enabled=true",[i.guildId,chain,address,label,i.user.id]);
    return i.editReply({content:"Wallet added to this server's watchlist. Automatic activity alerts are not enabled yet."});
   }
   if(sub==="watch-remove"){
    const chain=i.options.getString("chain"),address=i.options.getString("address").trim();
    const q=await pool.query("DELETE FROM tracked_wallets WHERE guild_id=$1 AND chain=$2 AND lower(address)=lower($3) RETURNING id",[i.guildId,chain,address]);
    return i.editReply({content:q.rowCount?"Wallet removed.":"No matching wallet found in this server's watchlist."});
   }
   if(sub==="watch-list"){
    const q=await pool.query("SELECT chain,address,label FROM tracked_wallets WHERE guild_id=$1 AND enabled=true ORDER BY created_at DESC LIMIT 25",[i.guildId]);
    const body=q.rows.length?q.rows.map((r,n)=>`${n+1}. **${r.chain}** — \`${r.address}\`${r.label?" ("+r.label+")":""}`).join("\n"):"No wallets are being watched by this server.";
    return i.editReply({content:body});
   }
  }
  if(i.commandName==="whale") return i.editReply({embeds:[errorEmbed("Global whale-transfer indexer is not connected yet. No whale transactions will be fabricated.") ]});
  if(i.commandName==="token") return i.editReply({embeds:[errorEmbed("Token risk scanning is not enabled yet. Reliable scoring requires contract metadata, liquidity/holder signals and source evidence. No score will be fabricated.") ]});
  if(i.commandName==="alerts") return i.editReply({embeds:[errorEmbed("Alert rules and event polling are not integrated yet. Wallet watchlist storage requires PostgreSQL.") ]});
 }catch(e){console.error("Interaction error:",e);return i.editReply({embeds:[errorEmbed(e.message||"Unexpected error. Check bot logs.")]});}
});
client.on("error",e=>console.error("Discord client error:",e));
process.on("unhandledRejection",e=>console.error("Unhandled rejection:",e));
if(!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required");
client.login(process.env.DISCORD_TOKEN);
