require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require("discord.js");
const { MATRIX, decodeMatrix, sha256, decryptOpenSslAes256Cbc, beaufort } = require("./gsmg/core");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");

const command = new SlashCommandBuilder()
 .setName("gsmg").setDescription("GSMG 5 BTC puzzle research and analysis")
 .addSubcommand(s => s.setName("status").setDescription("Show solver modules"))
 .addSubcommand(s => s.setName("matrix").setDescription("Re-run the published 14x14 matrix extraction"))
 .addSubcommand(s => s.setName("sha256").setDescription("SHA-256 an exact text input").addStringOption(o => o.setName("text").setDescription("Preserves exact spaces and case").setRequired(true).setMaxLength(1800)))
 .addSubcommand(s => s.setName("decrypt").setDescription("Decrypt an OpenSSL AES-256-CBC salted Base64 blob")
   .addStringOption(o => o.setName("password").setDescription("Exact password or SHA-256 hex").setRequired(true).setMaxLength(256))
   .addStringOption(o => o.setName("blob").setDescription("Base64 blob (for short inputs)").setMaxLength(1800))
   .addAttachmentOption(o => o.setName("file").setDescription("Upload a text file for long blobs")))
 .addSubcommand(s => s.setName("beaufort").setDescription("Run Beaufort cipher")
   .addStringOption(o => o.setName("text").setDescription("Ciphertext").setRequired(true).setMaxLength(1800))
   .addStringOption(o => o.setName("key").setDescription("Exact key").setRequired(true).setMaxLength(128)));

async function registerCommands() {
 const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
 const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
 await rest.put(route, { body: [command.toJSON()] });
}
function codeBlock(s) { return "```\n" + String(s).slice(0, 3500).replace(/```/g, "` ` `") + "\n```"; }

async function main() {
 await registerCommands();
 const client = new Client({ intents: [GatewayIntentBits.Guilds] });
 client.once("ready", () => console.log("TERA GSMG SOLVER online as " + client.user.tag));
 client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "gsmg") return;
  await interaction.deferReply({ ephemeral: true });
  try {
   const sub = interaction.options.getSubcommand();
   let description = "";
   if (sub === "status") description =
    "**Implemented**\n• 14×14 counterclockwise spiral extraction\n• SHA-256 exact UTF-8 input\n• OpenSSL AES-256-CBC salted Base64 (MD5/SHA-256 derivation)\n• Beaufort cipher\n\n**Next modules**\n• Complete VIC cipher\n• EBCDIC 1141 mapping\n• Salphaseion blob parser and evidence ledger\n• Audio/image asset analysis";
   if (sub === "matrix") {
    const result = decodeMatrix(MATRIX);
    description = "Extracted: **" + result.text + "**\nBits: " + result.bitLength + "\nBytes: " + result.byteLength + "\nPublished clue match: **" + (result.text === "gsmg.io/theseedisplanted" ? "YES" : "NO") + "**";
   }
   if (sub === "sha256") {
    const input = interaction.options.getString("text", true);
    description = "Input bytes: " + Buffer.byteLength(input, "utf8") + "\nSHA-256:\n" + codeBlock(sha256(input));
   }
   if (sub === "decrypt") {
    let blob = interaction.options.getString("blob");
    const file = interaction.options.getAttachment("file");
    if (!blob && file) {
     const response = await fetch(file.url);
     if (!response.ok) throw new Error("Could not fetch the attached text file.");
     blob = await response.text();
    }
    if (!blob) throw new Error("Supply blob text or attach a text file.");
    const password = interaction.options.getString("password", true);
    const plain = decryptOpenSslAes256Cbc(blob, password);
    description = "Decrypted plaintext:\n" + codeBlock(plain);
   }
   if (sub === "beaufort") {
    const plain = beaufort(interaction.options.getString("text", true), interaction.options.getString("key", true));
    description = "Beaufort output:\n" + codeBlock(plain);
   }
   await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x39ff14).setTitle("TERA GSMG SOLVER").setDescription(description.slice(0, 4000))] });
  } catch (error) {
   await interaction.editReply({ content: "Analysis error: " + String(error.message || error).slice(0, 1500) });
  }
 });
 client.on("error", error => console.error("Discord error:", error));
 await client.login(DISCORD_TOKEN);
}
main().catch(error => { console.error(error); process.exit(1); });
