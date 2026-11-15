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
async function setupServer(guild){
 const {ChannelType,PermissionFlagsBits}=require("discord.js");
 const roleSpecs=[
  {name:"Tera Owner",color:0xF5B700,permissions:[PermissionFlagsBits.Administrator]},
  {name:"Tera Admin",color:0xD99A00,permissions:[PermissionFlagsBits.ManageMessages,PermissionFlagsBits.ModerateMembers]},
  {name:"Analyst",color:0xE8C547,permissions:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]},
  {name:"Verified",color:0xB58B28,permissions:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
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
  {id:roles["Tera Owner"].id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
  {id:roles["Tera Admin"].id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
 ];
 const categories=[
  {name:"START HERE",channels:[["welcome","Welcome to TERA ON-CHAIN."],["rules","Server rules and safety guidelines."],["announcements","Official TERA updates."]]},
  {name:"MARKET INTELLIGENCE",channels:[["whale-alerts","Large on-chain transfer alerts."],["smart-money","Wallet activity and smart-money research."],["token-scanner","Token research and risk reports."],["market-news","Market intelligence and updates."]]},
  {name:"WALLET LAB",channels:[["wallet-analysis","Discuss public wallet analysis."],["watchlists","Community wallet watchlists and tracking."],["on-chain-data","On-chain research and evidence."]]},
  {name:"COMMUNITY",channels:[["general","General community chat."],["signals-discussion","Discuss signals with evidence and sources."],["support","Get help with TERA ON-CHAIN."]]},
  {name:"STAFF ONLY",channels:[["staff-chat","Private staff coordination."],["mod-logs","Private moderation and setup logs."]],private:true}
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
   if(!i.guild.members.me.permissions.has(["ManageChannels","ManageRoles"])) throw new Error("Give the bot Manage Channels and Manage Roles permissions, then run /setup again.");
   const result=await setupServer(i.guild);
   return i.editReply({content:`TERA ON-CHAIN server structure is ready.\\nCreated/verified roles: ${result.roles.join(", ")}\\nCreated/verified channels: ${result.channels.length}\\nNo existing channels or messages were deleted.`});
  }
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
