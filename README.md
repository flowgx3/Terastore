# Tera Store — Discord Bot

Discord.js v14 starter for a digital-goods store.

## Features
- `/setup`: creates the initial server categories, channels, and roles.
- `/panel`: posts a support-ticket button.
- `/ticket`: opens a private support channel.
- `/product add|list`: product catalog.
- `/stock set|add|remove|list`: inventory management.
- `/order`: records a pending order request and logs it for staff.

## Requirements
- Node.js 20+
- Discord application and bot
- Bot invited with `bot` and `applications.commands` scopes

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values.
3. `npm run deploy`
4. `npm start`

Never commit or share your bot token. The first version stores data in a local JSON file; use persistent database storage before production. Orders are pending requests and payment confirmation is manual. Never ask customers for passwords or one-time codes. Only sell goods you are authorized to resell.
