# Private Server Utilities Bot

A private Discord utilities/moderation bot built with discord.js v14 and SQLite.

## Setup
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in the existing bot credentials.
4. Enable the **Server Members Intent** and **Message Content Intent** only if your configuration/features require them. This bot uses Guilds, GuildMembers, GuildMessages, and AutoModerationExecution.
5. Run `npm start`.

## Environment
- `DISCORD_TOKEN`: existing bot token (never commit it).
- `CLIENT_ID`: existing Discord application ID.
- `GUILD_ID`: optional; registers commands instantly to one server when supplied. Leave empty for global registration.
- `OWNER_ID`: Discord user ID allowed to run /reboot.
- `LOG_CHANNEL_ID`: optional moderation log channel.

## Commands
/addrole, /autowarns, /reboot, /say, /slowmode, /warn, /warnings,
/removewarn, /clearwarnings, /ban, /unban, /kick, /timeout, /untimeout,
/purge, /userinfo, /serverinfo, /help.

Warnings and AutoMod infractions are stored in `data/moderation.sqlite`.
Keep the `data` folder persistent on your host. The /reboot command exits cleanly; the hosting provider must have automatic restart enabled.
