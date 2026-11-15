require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const WALLET_CHAINS = [\n  {name:"Bitcoin",value:"bitcoin"},{name:"Ethereum",value:"ethereum"},{name:"Solana",value:"solana"},\n  {name:"BNB Smart Chain",value:"bsc"},{name:"Base",value:"base"},{name:"Polygon",value:"polygon"},\n  {name:"Arbitrum One",value:"arbitrum"},{name:"Optimism",value:"optimism"},{name:"Avalanche C-Chain",value:"avalanche"}\n];\nconst TOKEN_CHAINS = WALLET_CHAINS.filter(c=>c.value!=="bitcoin");\n\nconst commands = [
  new SlashCommandBuilder().setName("setup").setDescription("⚠️ Delete all server channels and rebuild TERA ON-CHAIN").setDefaultMemberPermissions(8).addBooleanOption(o => o.setName("confirm").setDescription("Confirm deleting ALL channels and their contents").setRequired(true)),
  new SlashCommandBuilder().setName("onchain").setDescription("TERA ON-CHAIN status and supported networks"),
  new SlashCommandBuilder().setName("wallet").setDescription("Analyze and monitor blockchain wallets")
    .addSubcommand(s => s.setName("analyze").setDescription("Read live public wallet balances")
      .addStringOption(o => o.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(
        {name:"Ethereum",value:"ethereum"},{name:"Solana",value:"solana"}))
      .addStringOption(o => o.setName("address").setDescription("Public wallet address").setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName("watch-add").setDescription("Add a wallet to this server's watchlist")
      .addStringOption(o => o.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(
        {name:"Ethereum",value:"ethereum"},{name:"Solana",value:"solana"}))
      .addStringOption(o => o.setName("address").setDescription("Public wallet address").setRequired(true).setMaxLength(100))
      .addStringOption(o => o.setName("label").setDescription("Optional label").setMaxLength(50)))
    .addSubcommand(s => s.setName("watch-remove").setDescription("Remove a wallet from this server's watchlist")
      .addStringOption(o => o.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(
        {name:"Ethereum",value:"ethereum"},{name:"Solana",value:"solana"}))
      .addStringOption(o => o.setName("address").setDescription("Wallet address").setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName("watch-list").setDescription("List wallets watched by this server")),
  new SlashCommandBuilder().setName("whale").setDescription("Large on-chain transfer intelligence")
    .addSubcommand(s => s.setName("latest").setDescription("Show latest indexed whale transfers")),
  new SlashCommandBuilder().setName("token").setDescription("Token intelligence and risk screening")
    .addSubcommand(s => s.setName("scan").setDescription("Scan a token contract or mint")
      .addStringOption(o => o.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(
        {name:"Ethereum",value:"ethereum"},{name:"Solana",value:"solana"}))
      .addStringOption(o => o.setName("address").setDescription("Token contract or mint address").setRequired(true).setMaxLength(100))),
  new SlashCommandBuilder().setName("alerts").setDescription("Configure on-chain alerts")
    .addSubcommand(s => s.setName("status").setDescription("Show alert system readiness"))
].map(c => c.toJSON());

async function main() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error("Missing DISCORD_TOKEN or CLIENT_ID");
  const rest = new REST({version:"10"}).setToken(DISCORD_TOKEN);
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route,{body:commands});
  console.log(`Registered ${commands.length} TERA ON-CHAIN commands (${GUILD_ID ? "guild test" : "global"} scope).`);
}
main().catch(e=>{console.error(e);process.exit(1);});
