require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Create Tera Store server structure").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName("panel").setDescription("Post the support ticket panel"),
  new SlashCommandBuilder().setName("ticket").setDescription("Open a private support ticket")
    .addStringOption(o => o.setName("reason").setDescription("What do you need help with?").setMaxLength(300)),
  new SlashCommandBuilder().setName("product").setDescription("Manage products")
    .addSubcommand(s => s.setName("add").setDescription("Add a product")
      .addStringOption(o => o.setName("name").setDescription("Product name").setRequired(true).setMaxLength(80))
      .addIntegerOption(o => o.setName("price").setDescription("Price in DZD").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("description").setDescription("Description").setMaxLength(500)))
    .addSubcommand(s => s.setName("list").setDescription("List products")),
  new SlashCommandBuilder().setName("stock").setDescription("Manage inventory")
    .addSubcommand(s => s.setName("set").setDescription("Set stock")
      .addStringOption(o => o.setName("product").setDescription("Product name").setRequired(true))
      .addIntegerOption(o => o.setName("quantity").setDescription("Quantity").setRequired(true).setMinValue(0)))
    .addSubcommand(s => s.setName("add").setDescription("Add stock")
      .addStringOption(o => o.setName("product").setDescription("Product name").setRequired(true))
      .addIntegerOption(o => o.setName("quantity").setDescription("Quantity").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove stock")
      .addStringOption(o => o.setName("product").setDescription("Product name").setRequired(true))
      .addIntegerOption(o => o.setName("quantity").setDescription("Quantity").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("list").setDescription("List stock levels")),
  new SlashCommandBuilder().setName("order").setDescription("Request or manage an order")
    .addSubcommand(s => s.setName("create").setDescription("Request a product")
      .addStringOption(o => o.setName("product").setDescription("Exact product name").setRequired(true))
      .addIntegerOption(o => o.setName("quantity").setDescription("Quantity").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("manage").setDescription("Confirm or reject a pending order (staff only)")
      .addStringOption(o => o.setName("order_id").setDescription("Order ID, e.g. TS-ABC123").setRequired(true))
      .addStringOption(o => o.setName("action").setDescription("Decision").setRequired(true)
        .addChoices({ name: "Confirm payment and fulfill", value: "confirm" }, { name: "Reject order", value: "reject" })))
].map(c => c.toJSON());

async function main() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error("Set DISCORD_TOKEN and CLIENT_ID in .env");
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log("Slash commands registered.");
}
main().catch(error => { console.error(error); process.exit(1); });
