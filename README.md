# Terastore Discord Bot

Private single-server Discord utility and moderation bot.

## Requirements
- Node.js 20+
- Discord application/bot with Server Members Intent and Auto Moderation Execution intent enabled where available
- Bot permissions: Manage Roles, Manage Messages, Moderate Members, Kick Members, Ban Members, View Audit Log, Send Messages, Embed Links

## Setup
1. Copy `.env.example` to `.env` and fill in the values.
2. Install dependencies: `npm install`
3. Start: `npm start`

The hosting panel must provide the environment variables directly. Never commit `.env` or share the bot token.

## Commands
- `/addrole`, `/warn`, `/warnings`, `/removewarn`, `/clearwarnings`
- `/autowarns`, `/slowmode`, `/say`, `/purge`, `/reboot`
- `/kick`, `/ban`, `/timeout`, `/untimeout`, `/userinfo`, `/serverinfo`, `/help`

Warning and AutoMod records are stored in `data/moderation.json`.
