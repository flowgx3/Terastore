require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require("discord.js");
const { MATRIX, decodeMatrix, sha256, decryptOpenSslAes256Cbc, beaufort } = require("./gsmg/core");

const token = process.env.GSMG_DISCORD_TOKEN;
const clientId = process.env.GSMG_CLIENT_ID;
const guildId = process.env.GSMG_GUILD_ID;
if (!token || !clientId) throw new Error("Set GSMG_DISCORD_TOKEN and GSMG_CLIENT_ID.");

const command = new SlashCommandBuilder().setName("gsmg").setDescription("TERA GSMG puzzle analysis")
 .addSubcommand(s => s.setName("status").setDescription("Show solver modules and evidence status"))
 .addSubcommand(s => s.setName("matrix").setDescription("Re-run the published 14x14 spiral extraction"))
 .addSubcommand(s => s.setName("sha256").setDescription("Hash an exact text string").addStringOption(o=>o.setName("text").setDescription("Exact input; case and spaces are preserved").setRequired(true).setMaxLength(1500)))
 .addSubcommand(s => s.setName("decrypt").setDescription("Decrypt an OpenSSL AES-256-CBC salted Base64 blob").addStringOption(o=>o.setName("blob").setDescription("Base64 ciphertext").setRequired(true).setMaxLength(4000)).addStringOption(o=>o.setName("password").setDescription("Password or SHA-256 hex supplied by the puzzle").setRequired(true).setMaxLength(256)).addStringOption(o=>o.setName("digest").setDescription("OpenSSL key derivation digest").addChoices({name:"MD5 (legacy default)",value:"md5"},{name:"SHA-256",value:"sha256"})))
 .addSubcommand(s => s.setName("beaufort").setDescription("Run Beaufort on alphabetic text").addStringOption(o=>o.setName("text").setDescription("Ciphertext").setRequired(true).setMaxLength(1500)).addStringOption(o=>o.setName("key").setDescription("Key").setRequired(true).setMaxLength(128)));
async function main() {
 const rest = new REST({version:"10"}).setToken(token);
 await rest.put(guildId ? Routes.applicationGuildCommands(clientId,guildId) : Routes.applicationCommands(clientId), {body:[command.toJSON()]});
 const client = new Client({intents:[GatewayIntentBits.Guilds]});
 client.once("ready",()=>console.log("TERA GSMG SOLVER online as "+client.user.tag));
 client.on("interactionCreate",async i=>{
  if(!i.isChatInputCommand() || i.commandName!=="gsmg") return;
  await i.deferReply({ephemeral:true});
  try {
   const sub=i.options.getSubcommand(); let title="TERA GSMG SOLVER", body="";
   if(sub==="status") body="**Available and reproducible**\n• 14×14 spiral extraction\n• SHA-256 exact-input hashing\n• OpenSSL AES-256-CBC salted Base64 (MD5/SHA-256 KDF)\n• Beaufort substitution\n\n**Not yet imported**\n• Full original phase/blob archive\n• Audio/image assets beyond the matrix\n• VIC cipher and complete EBCDIC-1141 mapping";
   if(sub==="matrix") { const r=decodeMatrix(MATRIX); body="**Extracted text**\n\u0060"+r.text+"\u0060\nBits: "+r.bitLength+" • Bytes: "+r.byteLength+"\nExpected published clue: \u0060gsmg.io/theseedisplanted\u0060\nMatch: "+(r.text==="gsmg.io/theseedisplanted"?"YES":"NO"); }
   if(sub==="sha256") { const input=i.options.getString("text",true); body="Input length: "+Buffer.byteLength(input,"utf8")+" bytes\nSHA-256:\n\u0060"+sha256(input)+"\u0060"; }
   if(sub==="decrypt") { const blob=i.options.getString("blob",true), password=i.options.getString("password",true), digest=i.options.getString("digest")||"md5"; const plain=decryptOpenSslAes256Cbc(blob,password,digest); body="KDF: "+digest+"\nPlaintext:\n\u0060\u0060\u0060\n"+plain.slice(0,3500)+"\n\u0060\u0060\u0060"; }
   if(sub==="beaufort") { const plain=beaufort(i.options.getString("text",true),i.options.getString("key",true)); body="Plaintext:\n\u0060\u0060\u0060\n"+plain.slice(0,3500)+"\n\u0060\u0060\u0060"; }
   await i.editReply({embeds:[new EmbedBuilder().setColor(0x39ff14).setTitle(title).setDescription(body.slice(0,4000))]});
  } catch(e) { await i.editReply({content:"Analysis failed: "+String(e.message||e).slice(0,1500)}); }
 });
 await client.login(token);
}
main().catch(e=>{console.error(e);process.exit(1);});
