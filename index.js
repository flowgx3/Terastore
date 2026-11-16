require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ChannelType
} = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, OWNER_ID, LOG_CHANNEL_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in environment.");
  process.exit(1);
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "moderation.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS warnings (
 id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
 moderator_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS automod (
 id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
 rule_id TEXT, action TEXT, channel_id TEXT, matched_content TEXT, created_at TEXT NOT NULL
);
`);

const commands = [
  new SlashCommandBuilder().setName("addrole").setDescription("Add a role to a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addRoleOption(o=>o.setName("role").setDescription("Role to add").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("autowarns").setDescription("Show a member's AutoMod infractions")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("reboot").setDescription("Restart the bot process"),
  new SlashCommandBuilder().setName("say").setDescription("Send a message in a channel")
    .addChannelOption(o=>o.setName("channel").setDescription("Destination channel").addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption(o=>o.setName("message").setDescription("Message to send").setMaxLength(2000).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode")
    .addIntegerOption(o=>o.setName("seconds").setDescription("0 to 21600 seconds").setMinValue(0).setMaxValue(21600).setRequired(true))
    .addChannelOption(o=>o.setName("channel").setDescription("Channel (defaults to current)").addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))\n    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("warnings").setDescription("Show a member's warnings")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("removewarn").setDescription("Remove a warning by ID")
    .addIntegerOption(o=>o.setName("id").setDescription("Warning ID").setMinValue(1).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear all warnings for a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("unban").setDescription("Unban by user ID")
    .addStringOption(o=>o.setName("user_id").setDescription("Discord user ID").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addIntegerOption(o=>o.setName("minutes").setDescription("1 to 40320 minutes").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout")
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages")
    .addIntegerOption(o=>o.setName("amount").setDescription("1 to 100").setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show member information")
    .addUserOption(o=>o.setName("member").setDescription("Member (defaults to you)")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
  new SlashCommandBuilder().setName("help").setDescription("Show bot commands")
].map(c=>c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration],
  partials: [Partials.User, Partials.GuildMember]
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} commands ${GUILD_ID ? "to guild "+GUILD_ID : "globally"}.`);
}
function isStaff(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
    i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}
async function logAction(guild, title, description, color=0x5865F2) {
  if (!LOG_CHANNEL_ID) return;
  const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(()=>null);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp()] }).catch(()=>{});
}
async function notify(user, title, description) {
  await user.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(title).setDescription(description).setTimestamp()] }).catch(()=>{});
}
function denied(i, msg="You do not have permission to use this command.") {
  return i.reply({ content: msg, ephemeral: true });
}
client.once("ready", c => console.log(`Logged in as ${c.user.tag}`));

client.on("autoModerationActionExecution", async execution => {
  try {
    const userId = execution.userId;
    const channelId = execution.channelId || null;
    const matched = execution.content ? execution.content.slice(0,500) : null;
    db.prepare("INSERT INTO automod (guild_id,user_id,rule_id,action,channel_id,matched_content,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(execution.guild.id, userId, execution.ruleId, execution.action?.type?.toString() || "AutoMod", channelId, matched, new Date().toISOString());
    await logAction(execution.guild, "AutoMod infraction", `User: <@${userId}>\\nRule: ${execution.ruleId}\\nAction: ${execution.action?.type ?? "Unknown"}`, 0xFEE75C);
  } catch (e) { console.error("AutoMod event error:", e); }
});

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;
  const cmd = i.commandName;
  try {
    if (["warn","warnings","removewarn","clearwarnings","autowarns","ban","unban","kick","timeout","untimeout"].includes(cmd) && !isStaff(i)) return denied(i);
    if (cmd === "reboot" && i.user.id !== OWNER_ID) return denied(i, "Only the bot owner can reboot this bot.");
    if (cmd === "addrole") {
      const member = i.options.getMember("member"), role = i.options.getRole("role");
      if (!member) return i.reply({content:"Member not found in this server.",ephemeral:true});
      if (role.managed || role.position >= i.guild.members.me.roles.highest.position) return i.reply({content:"I cannot assign that role. Check the bot's role hierarchy.",ephemeral:true});
      await member.roles.add(role, `Requested by ${i.user.tag}`);
      await i.reply({content:`Added ${role} to **${member.user.tag}**.`,ephemeral:true});
      return logAction(i.guild,"Role added",`${i.user} added ${role} to <@${member.id}>.`);
    }
    if (cmd === "autowarns") {
      const user=i.options.getUser("member");
      const rows=db.prepare("SELECT * FROM automod WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 10").all(i.guildId,user.id);
      const total=db.prepare("SELECT COUNT(*) n FROM automod WHERE guild_id=? AND user_id=?").get(i.guildId,user.id).n;
      const desc=rows.length ? rows.map(x=>`#${x.id} • <t:${Math.floor(new Date(x.created_at).getTime()/1000)}:R> • Rule ${x.rule_id} • ${x.action}`).join("\\n") : "No recorded AutoMod infractions.";
      return i.reply({embeds:[new EmbedBuilder().setColor(0xFEE75C).setTitle(`AutoMod infractions — ${user.tag}`).setDescription(desc).setFooter({text:`Total recorded: ${total}`})],ephemeral:true});
    }
    if (cmd === "warn") {
      const user=i.options.getUser("member"), reason=i.options.getString("reason");
      const result=db.prepare("INSERT INTO warnings (guild_id,user_id,moderator_id,reason,created_at) VALUES (?,?,?,?,?)").run(i.guildId,user.id,i.user.id,reason,new Date().toISOString());
      await notify(user,"You received a warning",`Server: **${i.guild.name}**\\nReason: ${reason}\\nWarning ID: ${result.lastInsertRowid}`);
      await i.reply({content:`Warned **${user.tag}**. Warning ID: ${result.lastInsertRowid}.`,ephemeral:true});
      return logAction(i.guild,"Member warned",`Member: <@${user.id}>\\nModerator: ${i.user}\\nReason: ${reason}\\nID: ${result.lastInsertRowid}`,0xFEE75C);
    }
    if (cmd === "warnings") {
      const user=i.options.getUser("member");
      const rows=db.prepare("SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 15").all(i.guildId,user.id);
      const total=db.prepare("SELECT COUNT(*) n FROM warnings WHERE guild_id=? AND user_id=?").get(i.guildId,user.id).n;
      const desc=rows.length ? rows.map(x=>`**#${x.id}** • <t:${Math.floor(new Date(x.created_at).getTime()/1000)}:d> • ${x.reason.slice(0,180)} • by <@${x.moderator_id}>`).join("\\n") : "No warnings recorded.";
      return i.reply({embeds:[new EmbedBuilder().setColor(0xFEE75C).setTitle(`Warnings — ${user.tag}`).setDescription(desc).setFooter({text:`Total: ${total} • Showing latest 15`})],ephemeral:true});
    }
    if (cmd === "removewarn") {
      const id=i.options.getInteger("id");
      const row=db.prepare("SELECT * FROM warnings WHERE id=? AND guild_id=?").get(id,i.guildId);
      if (!row) return i.reply({content:"Warning ID not found.",ephemeral:true});
      db.prepare("DELETE FROM warnings WHERE id=?").run(id);
      await i.reply({content:`Removed warning #${id}.`,ephemeral:true});
      return logAction(i.guild,"Warning removed",`Warning #${id} removed by ${i.user}.`);
    }
    if (cmd === "clearwarnings") {
      const user=i.options.getUser("member");
      const r=db.prepare("DELETE FROM warnings WHERE guild_id=? AND user_id=?").run(i.guildId,user.id);
      await i.reply({content:`Cleared ${r.changes} warnings for **${user.tag}**.`,ephemeral:true});
      return logAction(i.guild,"Warnings cleared",`${i.user} cleared ${r.changes} warnings for <@${user.id}>.`);
    }
    if (cmd === "say") {
      const channel=i.options.getChannel("channel"), message=i.options.getString("message");
      await channel.send({content:message, allowedMentions:{parse:[]}});
      return i.reply({content:`Message sent in ${channel}.`,ephemeral:true});
    }
    if (cmd === "slowmode") {
      const channel=i.options.getChannel("channel") || i.channel, seconds=i.options.getInteger("seconds");
      if (!channel?.setRateLimitPerUser) return i.reply({content:"This channel does not support slowmode.",ephemeral:true});
      await channel.setRateLimitPerUser(seconds,`Changed by ${i.user.tag}`);
      return i.reply({content:`Slowmode in ${channel} set to **${seconds} seconds**.`,ephemeral:true});
    }
    if (cmd === "reboot") {
      await i.reply({content:"Restarting bot process. The host must have auto-restart enabled.",ephemeral:true});
      setTimeout(()=>process.exit(0),1500);
      return;
    }
    if (cmd === "ban" || cmd === "kick" || cmd === "timeout" || cmd === "untimeout") {
      const user=i.options.getUser("member");
      const member=await i.guild.members.fetch(user.id).catch(()=>null);
      if (!member) return i.reply({content:"Member is not in this server.",ephemeral:true});
      const reason=i.options.getString("reason") || `Action by ${i.user.tag}`;
      if (cmd==="ban") { await notify(user,"You were banned",`Server: **${i.guild.name}**\\nReason: ${reason}`); await member.ban({reason}); }
      if (cmd==="kick") { await notify(user,"You were kicked",`Server: **${i.guild.name}**\\nReason: ${reason}`); await member.kick(reason); }
      if (cmd==="timeout") { const mins=i.options.getInteger("minutes"); await notify(user,"You were timed out",`Server: **${i.guild.name}**\\nDuration: ${mins} minutes\\nReason: ${reason}`); await member.timeout(mins*60000,reason); }
      if (cmd==="untimeout") await member.timeout(null,`Removed by ${i.user.tag}`);
      await i.reply({content:`Successfully executed **${cmd}** for **${user.tag}**.`,ephemeral:true});
      return logAction(i.guild,`Member ${cmd}`,`Member: <@${user.id}>\\nModerator: ${i.user}\\nReason: ${reason}`,0xED4245);
    }
    if (cmd === "unban") {
      const id=i.options.getString("user_id"), reason=i.options.getString("reason") || `Unbanned by ${i.user.tag}`;
      await i.guild.members.unban(id,reason);
      await i.reply({content:`Unbanned user ${id}.`,ephemeral:true});
      return logAction(i.guild,"Member unbanned",`User ID: ${id}\\nModerator: ${i.user}\\nReason: ${reason}`);
    }
    if (cmd === "purge") {
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return denied(i);
      const amount=i.options.getInteger("amount");
      const deleted=await i.channel.bulkDelete(amount,true);
      return i.reply({content:`Deleted ${deleted.size} messages. (Discord does not bulk-delete messages older than 14 days.)`,ephemeral:true});
    }
    if (cmd === "userinfo") {
      const user=i.options.getUser("member") || i.user;
      const member=await i.guild.members.fetch(user.id).catch(()=>null);
      const embed=new EmbedBuilder().setColor(0x5865F2).setTitle(user.tag).setThumbnail(user.displayAvatarURL()).addFields(
        {name:"User ID",value:user.id,inline:true},
        {name:"Account created",value:`<t:${Math.floor(user.createdTimestamp/1000)}:R>`,inline:true},
        {name:"Joined server",value:member?.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:R>`:"Unknown",inline:true}
      );
      return i.reply({embeds:[embed],ephemeral:true});
    }
    if (cmd === "serverinfo") {
      const g=i.guild;
      const embed=new EmbedBuilder().setColor(0x5865F2).setTitle(g.name).setThumbnail(g.iconURL()).addFields(
        {name:"Members",value:String(g.memberCount),inline:true},
        {name:"Created",value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
        {name:"Server ID",value:g.id,inline:true}
      );
      return i.reply({embeds:[embed],ephemeral:true});
    }
    if (cmd === "help") {
      const lines=commands.map(c=>`/${c.name} — ${c.description}`).join("\\n");
      return i.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle("Server Utilities").setDescription(lines)],ephemeral:true});
    }
  } catch (error) {
    console.error(`Command /${cmd} failed:`,error);
    const msg={content:`Command failed: ${String(error.message || error).slice(0,300)}`,ephemeral:true};
    if (i.deferred || i.replied) await i.followUp(msg).catch(()=>{});
    else await i.reply(msg).catch(()=>{});
  }
});

(async()=>{
  try { await registerCommands(); await client.login(DISCORD_TOKEN); }
  catch(e) { console.error("Startup failed:",e); process.exit(1); }
})();
