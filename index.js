require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ChannelType
} = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, OWNER_ID, LOG_CHANNEL_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID environment variable.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "moderation.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { warnings: parsed.warnings || {}, automod: parsed.automod || {} };
  } catch {
    return { warnings: {}, automod: {} };
  }
}
let db = loadData();
function saveData() {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
const key = (guildId, userId) => guildId + ":" + userId;
const staff = (member, permission = PermissionFlagsBits.ModerateMembers) =>
  member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(permission);

const commands = [
  new SlashCommandBuilder().setName("addrole").setDescription("Give a role to a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addRoleOption(o=>o.setName("role").setDescription("Role to give").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("warnings").setDescription("Show a member's warnings")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("removewarn").setDescription("Remove a warning by number")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addIntegerOption(o=>o.setName("number").setDescription("Warning number").setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear all warnings for a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("autowarns").setDescription("Show AutoMod actions for a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode")
    .addIntegerOption(o=>o.setName("seconds").setDescription("0 to 21600 seconds").setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("say").setDescription("Send a message in a channel")
    .addStringOption(o=>o.setName("message").setDescription("Message to send").setRequired(true).setMaxLength(2000))
    .addChannelOption(o=>o.setName("channel").setDescription("Target text channel").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("purge").setDescription("Delete up to 100 recent messages")
    .addIntegerOption(o=>o.setName("amount").setDescription("Number of messages").setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("reboot").setDescription("Restart the bot process (owner only)"),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addIntegerOption(o=>o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show member information")
    .addUserOption(o=>o.setName("member").setDescription("Member")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
  new SlashCommandBuilder().setName("help").setDescription("Show bot commands")
].map(c=>c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("Registered " + commands.length + " guild commands.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.AutoModerationExecution
  ],
  partials: [Partials.GuildMember, Partials.User]
});

const UI_COLOR = 0x4F9BD3;
function uiEmbed(description) {
  const embed = new EmbedBuilder().setColor(UI_COLOR).setDescription(description || null);
  if (client.user) embed.setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
  embed.setTimestamp();
  return embed;
}
function shortDate(iso) {
  const seconds = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(seconds) ? "<t:" + seconds + ":f>" : "Unknown date";
}
async function log(guild, text) {
  if (!LOG_CHANNEL_ID) return;
  const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (channel && channel.isTextBased()) channel.send({ content: text }).catch(()=>{});
}

client.on("autoModerationActionExecution", execution => {
  const guildId = execution.guild.id;
  const userId = execution.userId;
  const k = key(guildId, userId);
  db.automod[k] ||= [];
  db.automod[k].push({
    at: new Date().toISOString(),
    ruleId: execution.ruleId,
    triggerType: execution.ruleTriggerType,
    action: execution.action?.type ?? "unknown",
    channelId: execution.channelId ?? null,
    matchedKeyword: execution.matchedKeyword ?? null
  });
  db.automod[k] = db.automod[k].slice(-100);
  saveData();
  log(execution.guild, "AutoMod action for <@" + userId + "> (rule " + execution.ruleId + ").");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;
  try {
    if (commandName === "reboot") {
      if (!OWNER_ID || interaction.user.id !== OWNER_ID) return interaction.reply({content:"Owner only.",ephemeral:true});
      await interaction.reply({content:"Restarting…",ephemeral:true});
      setTimeout(()=>process.exit(0),1000);
      return;
    }
    if (commandName === "help") {
      const description =
        "**Util**\n\`/help\`, \`/userinfo\`, \`/serverinfo\`\n\n" +
        "**Moderation**\n\`/warn\`, \`/warnings\`, \`/autowarns\`, \`/addrole\`, \`/slowmode\`, \`/say\`, \`/purge\`, \`/kick\`, \`/ban\`, \`/timeout\`, \`/untimeout\`, \`/removewarn\`, \`/clearwarnings\`\n\n" +
        "Run \`/help\` followed by a command to view its options.";
      return interaction.reply({ embeds:[uiEmbed(description)] });
    }
    if (commandName === "serverinfo") {
      const e = new EmbedBuilder().setTitle(guild.name).addFields(
        {name:"Members",value:String(guild.memberCount),inline:true},
        {name:"Created",value:"<t:"+Math.floor(guild.createdTimestamp/1000)+":D>",inline:true}
      ).setThumbnail(guild.iconURL());
      return interaction.reply({embeds:[e]});
    }
    if (commandName === "userinfo") {
      const user = interaction.options.getUser("member") || interaction.user;
      const e = new EmbedBuilder().setTitle(user.tag).setThumbnail(user.displayAvatarURL())
        .addFields({name:"User ID",value:user.id},{name:"Created",value:"<t:"+Math.floor(user.createdTimestamp/1000)+":F>"});
      return interaction.reply({embeds:[e]});
    }
    if (commandName === "say") {
      if (!staff(member, PermissionFlagsBits.ManageMessages)) return interaction.reply({content:"You need Manage Messages.",ephemeral:true});
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      if (!channel.isTextBased() || !channel.send) return interaction.reply({content:"Invalid text channel.",ephemeral:true});
      await channel.send({content:interaction.options.getString("message"),allowedMentions:{parse:[]}});
      return interaction.reply({content:"Message sent.",ephemeral:true});
    }
    if (commandName === "slowmode") {
      if (!staff(member, PermissionFlagsBits.ManageChannels)) return interaction.reply({content:"You need Manage Channels.",ephemeral:true});
      await interaction.channel.setRateLimitPerUser(interaction.options.getInteger("seconds"));
      return interaction.reply({content:"Slowmode updated.",ephemeral:true});
    }
    if (commandName === "purge") {
      if (!staff(member, PermissionFlagsBits.ManageMessages)) return interaction.reply({content:"You need Manage Messages.",ephemeral:true});
      const count = await interaction.channel.bulkDelete(interaction.options.getInteger("amount"), true);
      return interaction.reply({content:"Deleted "+count.size+" messages. Messages older than 14 days cannot be bulk deleted.",ephemeral:true});
    }
    if (commandName === "addrole") {
      if (!staff(member, PermissionFlagsBits.ManageRoles)) return interaction.reply({content:"You need Manage Roles.",ephemeral:true});
      const user=interaction.options.getUser("member"), role=interaction.options.getRole("role");
      const target=await guild.members.fetch(user.id);
      if (role.position >= guild.members.me.roles.highest.position) return interaction.reply({content:"That role is above or equal to my highest role.",ephemeral:true});
      await target.roles.add(role);
      return interaction.reply({content:"Added "+role+" to "+user.tag+".",ephemeral:true});
    }
    if (["warn","warnings","removewarn","clearwarnings","autowarns"].includes(commandName)) {
      if (!staff(member)) return interaction.reply({content:"You need Moderate Members.",ephemeral:true});
      const user=interaction.options.getUser("member"), k=key(guild.id,user.id);
      db.warnings[k] ||= [];
      if (commandName === "warn") {
        const reason=interaction.options.getString("reason");
        db.warnings[k].push({id:require("node:crypto").randomUUID().replace(/-/g,"").slice(0,18),reason,by:interaction.user.id,at:new Date().toISOString()});
        saveData(); await log(guild,"Warning issued to <@"+user.id+"> by <@"+interaction.user.id+">: "+reason);
        return interaction.reply({content:"Warned "+user.tag+". Total warnings: "+db.warnings[k].length,ephemeral:true});
      }
      if (commandName === "warnings") {
        const list=db.warnings[k];
        if (!list.length) return interaction.reply({ content:"You have no infractions.", allowedMentions:{parse:[]} });
        const lines = list.slice(-12).map((w,i) =>
          "**ID:** \`" + (w.id || (user.id + "-" + (i+1))) + "\`\n" +
          "**Warn** - " + (w.reason || "No reason provided") + " - " + shortDate(w.at)
        );
        return interaction.reply({ embeds:[uiEmbed("Showing all infractions for " + user.tag + ".\n\n" + lines.join("\n\n"))] });
      }
      if (commandName === "removewarn") {
        const n=interaction.options.getInteger("number");
        if (n>db.warnings[k].length) return interaction.reply({content:"Warning number not found.",ephemeral:true});
        db.warnings[k].splice(n-1,1); saveData();
        return interaction.reply({content:"Warning removed.",ephemeral:true});
      }
      if (commandName === "clearwarnings") {
        db.warnings[k]=[]; saveData();
        return interaction.reply({content:"All warnings cleared.",ephemeral:true});
      }
      const list=db.automod[k] || [];
      if (!list.length) return interaction.reply({ content:"You have no automod infractions.", allowedMentions:{parse:[]} });
      const lines = list.slice(-12).map((a,i) =>
        "**ID:** \`" + (a.id || (user.id + "-AM-" + (i+1))) + "\`\n" +
        "**AutoMod** - " + String(a.action || "Action") + " - " + shortDate(a.at)
      );
      return interaction.reply({ embeds:[uiEmbed("Showing all automod infractions for " + user.tag + ".\n\n" + lines.join("\n\n"))] });
    }
    if (commandName === "kick" || commandName === "ban") {
      const required=commandName==="kick"?PermissionFlagsBits.KickMembers:PermissionFlagsBits.BanMembers;
      if (!staff(member,required)) return interaction.reply({content:"Missing required permission.",ephemeral:true});
      const user=interaction.options.getUser("member"), reason=interaction.options.getString("reason") || "No reason provided";
      if (commandName==="kick") {
        const target=await guild.members.fetch(user.id);
        if (!target.kickable) return interaction.reply({content:"I cannot kick this member due to role hierarchy or permissions.",ephemeral:true});
        await target.kick(reason);
      } else {
        if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({content:"I need Ban Members permission.",ephemeral:true});
        await guild.members.ban(user.id,{reason});
      }
      await log(guild,commandName+" action on "+user.tag+" by "+interaction.user.tag+": "+reason);
      return interaction.reply({content:user.tag+" "+(commandName==="kick"?"kicked.":"banned."),ephemeral:true});
    }
    if (commandName === "timeout" || commandName === "untimeout") {
      if (!staff(member)) return interaction.reply({content:"You need Moderate Members.",ephemeral:true});
      const user=interaction.options.getUser("member"), target=await guild.members.fetch(user.id);
      if (!target.moderatable) return interaction.reply({content:"I cannot moderate this member due to role hierarchy or permissions.",ephemeral:true});
      if (commandName==="timeout") await target.timeout(interaction.options.getInteger("minutes")*60000,interaction.options.getString("reason")||"No reason provided");
      else await target.timeout(null);
      return interaction.reply({content:commandName==="timeout"?"Timeout applied.":"Timeout removed.",ephemeral:true});
    }
  } catch (error) {
    console.error("Command error:",error);
    const msg={content:"An error occurred while running this command.",ephemeral:true};
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(()=>{});
    else await interaction.reply(msg).catch(()=>{});
  }
});

client.once("ready", () => console.log("Logged in as "+client.user.tag));
(async()=>{
  try {
    await registerCommands();
    await client.login(DISCORD_TOKEN);
  } catch(error) {
    console.error("Startup failed:",error);
    process.exit(1);
  }
})();
