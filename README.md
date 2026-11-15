# TERA ON-CHAIN

Read-only, multi-server Discord intelligence bot for public blockchain data.

## Current features
- `/onchain` — runtime and supported network status.
- `/wallet analyze` — native balance snapshot on Bitcoin, Ethereum, Solana, BNB Smart Chain, Base, Polygon, Arbitrum, Optimism and Avalanche.
- `/wallet watch-add`, `watch-remove`, `watch-list` — per-server tracked wallet storage.
- `/alerts channel` — configure the Discord destination for activity alerts.
- `/alerts threshold` — configure the minimum estimated USD value (0 disables the filter).
- `/alerts status` — show alert configuration and watched-wallet count.
- `/whale latest` — show recent monitored wallet activity.

## Alert coverage and limitations
The in-process worker polls every 30 seconds by default:
- Bitcoin: address transaction activity through mempool.space.
- Solana: signatures and native SOL balance changes through JSON-RPC.
- EVM networks (Ethereum, BNB Chain, Base, Polygon, Arbitrum, Optimism, Avalanche): native coin transfers found by scanning recent full blocks.

USD estimates use CoinGecko's public simple-price endpoint. If a USD threshold is set and a price is unavailable, the event is not sent because its threshold cannot be verified.

Important limitations:
- This is best-effort polling, not a guaranteed real-time stream. Public RPC and explorer APIs can rate-limit or become unavailable.
- EVM monitoring scans up to 10 blocks per poll cycle and can fall behind during congestion or provider throttling.
- ERC-20 and SPL token transfers, internal EVM transfers, swaps, NFT movements, and untracked global whale transactions are not included.
- The first poll initializes a cursor and does not send historical activity. Only later activity is eligible for alerts.
- A channel must be configured with `/alerts channel`; the bot needs View Channel, Send Messages and Embed Links permissions there.
- Native transfers are not necessarily buys or sells. The bot does not infer intent or label unknown wallets as smart money.

## Security
No private keys, seed phrases, custody, signing or automated trading. Never paste provider credentials into Discord or commit them to GitHub.

## Requirements
Node.js 20+, Discord bot with `bot` and `applications.commands` scopes, and PostgreSQL.

## Environment
Set `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and `DATABASE_URL`. Optional RPC overrides are documented in `.env.example`.

## Deploy
```bash
npm install
npm run deploy
npm start
```
