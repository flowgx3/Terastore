require("dotenv").config();
const {Client,GatewayIntentBits,EmbedBuilder}=require("discord.js");
const {Pool}=require("pg");
const {validAddress,analyzeWallet}=require("./services/chain-data");
const {startAlertWorker}=require("./services/alert-worker");
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="false"?false:{rejectUnauthorized:false},max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:8000}):null;
async function ensureGuild(guild){
 if(!pool) throw new Error("Wallet watchlist needs DATABASE_URL. Configure PostgreSQL and apply db/schema.sql first.");
 await pool.query("INSERT INTO guilds(guild_id,name) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET name=EXCLUDED.name,updated_at=now()",[guild.id,guild.name]);
}
const errorEmbed=m=>new EmbedBuilder().setColor(0xD97706).setTitle("TERA ON-CHAIN").setDescription(m);
async function ensureAlertSchema(){
 if(!pool)return;
 await pool.query("ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS last_seen_cursor TEXT");
 await pool.query("ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ");
 await pool.query("ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS min_alert_usd NUMERIC(30,8) NOT NULL DEFAULT 0");
 await pool.query("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS alert_threshold_usd NUMERIC(30,8) NOT NULL DEFAULT 0");
 await pool.query("CREATE TABLE IF NOT EXISTS chain_scan_state(chain TEXT PRIMARY KEY,last_scanned_block BIGINT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
}
client.once("ready",async()=>{
 console.log(`TERA ON-CHAIN online as ${client.user.tag}`);
 if(pool){try{await ensureAlertSchema();startAlertWorker(client,pool);console.log("Wallet alert worker started.");}catch(e){console.error("Alert worker startup failed:",e);}}
});
async function setupServer(guild){
 const {ChannelType,PermissionFlagsBits}=require("discord.js");
 // Destructive reset: remove every existing channel (text, voice, category, forum, etc.).
 const existing=await guild.channels.fetch();
 const ordered=[...existing.values()].sort((a,b)=>(a.type===ChannelType.GuildCategory?1:0)-(b.type===ChannelType.GuildCategory?1:0));
 for(const channel of ordered){ if(channel.deletable) await channel.delete("TERA ON-CHAIN full server setup reset"); }

 const roleSpecs=[
  {name:"👑 Tera Owner",color:0xF5B700,permissions:[PermissionFlagsBits.Administrator]},
  {name:"🛡️ Tera Admin",color:0xD99A00,permissions:[PermissionFlagsBits.ManageMessages,PermissionFlagsBits.ModerateMembers]},
  {name:"🔎 Analyst",color:0xE8C547,permissions:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]},
  {name:"✅ Verified",color:0xB58B28,permissions:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
 ];
 const roles={};
 for(const spec of roleSpecs){
  let role=guild.roles.cache.find(r=>r.name===spec.name);
  if(!role) role=await guild.roles.create({name:spec.name,color:spec.color,permissions:spec.permissions,reason:"TERA ON-CHAIN server setup"});
  roles[spec.name]=role;
 }
 const everyone=guild.roles.everyone;
 const staffOverwrites=[
  {id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
  {id:roles["👑 Tera Owner"].id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
  {id:roles["🛡️ Tera Admin"].id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
 ];
 const categories=[
  {name:"📌 START HERE",channels:[["👋・welcome","Welcome to TERA ON-CHAIN."],["📜・rules","Server rules and safety guidelines."],["📢・announcements","Official TERA updates."]]},
  {name:"📊 MARKET INTELLIGENCE",channels:[["🐋・whale-alerts","Large on-chain transfer alerts."],["🧠・smart-money","Wallet activity and smart-money research."],["🔍・token-scanner","Token research and risk reports."],["📈・market-news","Market intelligence and updates."]]},
  {name:"👛 WALLET LAB",channels:[["🔬・wallet-analysis","Discuss public wallet analysis."],["👀・watchlists","Community wallet watchlists and tracking."],["⛓️・on-chain-data","On-chain research and evidence."]]},
  {name:"💬 COMMUNITY",channels:[["💬・general","General community chat."],["🧩・signals-discussion","Discuss signals with evidence and sources."],["🆘・support","Get help with TERA ON-CHAIN."]]},
  {name:"🔒 STAFF ONLY",channels:[["🔐・staff-chat","Private staff coordination."],["🛡️・mod-logs","Private moderation and setup logs."]],private:true}
 ];
 const created=[];
 for(const group of categories){
  let category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===group.name);
  if(!category) category=await guild.channels.create({name:group.name,type:ChannelType.GuildCategory,permissionOverwrites:group.private?staffOverwrites:[] ,reason:"TERA ON-CHAIN server setup"});
  for(const [name,topic] of group.channels){
   let channel=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===name&&c.parentId===category.id);
   if(!channel) channel=await guild.channels.create({name,type:ChannelType.GuildText,parent:category.id,topic,permissionOverwrites:group.private?staffOverwrites:[],reason:"TERA ON-CHAIN server setup"});
   created.push("#"+name);
  }
 }
 return {roles:Object.keys(roles),channels:created};
}
client.on("interactionCreate",async i=>{
 if(!i.isChatInputCommand()) return;
 await i.deferReply({ephemeral:i.commandName==="wallet"&&i.options.getSubcommand()!=="analyze"});
 try{
  if(i.commandName==="setup"){
   if(!i.memberPermissions?.has("Administrator")) throw new Error("Only server administrators can run /setup.");
   if(i.options.getBoolean("confirm")!==true) throw new Error("Setup cancelled. Set confirm to true only when you intend to delete every channel.");
   const me=await i.guild.members.fetchMe();
   if(!me.permissions.has(["ManageChannels","ManageRoles"])) throw new Error("Give the bot Manage Channels and Manage Roles permissions, then run /setup again.");
   const result=await setupServer(i.guild);
   return i.editReply({content:`🟡 **TERA ON-CHAIN server rebuilt!**\\n🗑️ All previous channels and their messages were deleted.\\n👑 Roles: ${result.roles.join(", ")}\\n📁 New channels: ${result.channels.length}\\n✨ Categories and channels include emojis.`});
  }
  if(i.commandName==="onchain"){
   const e=new EmbedBuilder().setColor(0x16A34A).setTitle("TERA ON-CHAIN").setDescription("Read-only blockchain intelligence. No private keys, signing, custody or trading.")
    .addFields({name:"Live RPC",value:"BTC • ETH • SOL • BNB • BASE • POL • ARB • OP • AVAX",inline:true},{name:"Wallet analysis",value:"Available",inline:true},{name:"Wallet watchlist",value:pool?"PostgreSQL configured":"Database not configured",inline:true},{name:"Whale feed / Token risk",value:"Indexer integration pending — no fabricated results."})
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
    await pool.query("INSERT INTO tracked_wallets(guild_id,chain,address,label,added_by_user_id,min_alert_usd) VALUES($1,$2,$3,$4,$5,COALESCE((SELECT alert_threshold_usd FROM guilds WHERE guild_id=$1),0)) ON CONFLICT(guild_id,chain,address) DO UPDATE SET label=EXCLUDED.label,enabled=true",[i.guildId,chain,address,label,i.user.id]);
    return i.editReply({content:"👀 Wallet added. Monitoring is active; first poll establishes a baseline. Configure delivery with /alerts channel."});
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
  if(i.commandName==="whale"){
   const q=await pool.query("SELECT chain,payload,source_url FROM alert_events WHERE guild_id=$1 ORDER BY observed_at DESC LIMIT 10",[i.guildId]);
   if(!q.rowCount)return i.editReply({content:"🐋 No monitored wallet transfers recorded yet. Add wallets and configure /alerts channel."});
   const lines=q.rows.map(r=>{const p=r.payload||{};return "**"+r.chain.toUpperCase()+"** • "+(p.direction||"activity")+" • "+(p.amount||"?")+" "+(p.symbol||"")+" • [Explorer]("+r.source_url+")";});
   return i.editReply({content:"🐋 **Recent monitored wallet activity**\n"+lines.join("\n")});
  }
  if(i.commandName==="token") return i.editReply({embeds:[errorEmbed("Token risk scanning is not enabled yet. Reliable scoring requires contract metadata, liquidity/holder signals and source evidence. No score will be fabricated.") ]});
  if(i.commandName==="alerts"){
   await ensureGuild(i.guild);
   const sub=i.options.getSubcommand();
   if(sub==="channel"){
    const ch=i.options.getChannel("destination");
    await pool.query("UPDATE guilds SET alert_channel_id=$2,updated_at=now() WHERE guild_id=$1",[i.guildId,ch.id]);
    return i.editReply({content:"🔔 Alert destination set to <#"+ch.id+">."});
   }
   if(sub==="threshold"){
    const usd=i.options.getNumber("usd");
    await pool.query("UPDATE guilds SET alert_threshold_usd=$2,updated_at=now() WHERE guild_id=$1",[i.guildId,usd]);
    await pool.query("UPDATE tracked_wallets SET min_alert_usd=$2 WHERE guild_id=$1",[i.guildId,usd]);
    return i.editReply({content:usd===0?"🐋 USD threshold disabled.": "💵 Minimum alert threshold set to $"+usd.toLocaleString("en-US")+"."});
   }
   if(sub==="status"){
    const q=await pool.query("SELECT alert_channel_id,alert_threshold_usd FROM guilds WHERE guild_id=$1",[i.guildId]);
    const n=await pool.query("SELECT count(*)::int AS count FROM tracked_wallets WHERE guild_id=$1 AND enabled=true",[i.guildId]);
    const row=q.rows[0]||{};
    return i.editReply({content:"🔔 **Alert system**\n📣 Channel: "+(row.alert_channel_id?"<#"+row.alert_channel_id+">":"Not configured — use /alerts channel")+"\n💵 USD threshold: $"+Number(row.alert_threshold_usd||0).toLocaleString("en-US")+"\n👛 Watched wallets: "+n.rows[0].count+"\n🛰️ Polling: enabled\n⚠️ Native transfers only; token transfers are not monitored yet."});
   }
  }
 }catch(e){console.error("Interaction error:",e);return i.editReply({embeds:[errorEmbed(e.message||"Unexpected error. Check bot logs.")]});}
});
client.on("error",e=>console.error("Discord client error:",e));
process.on("unhandledRejection",e=>console.error("Unhandled rejection:",e));
if(!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required");
client.login(process.env.DISCORD_TOKEN);
