# TERA ON-CHAIN

Read-only, multi-server Discord intelligence bot for public blockchain data.

## Current MVP
- `/onchain` — runtime and feature readiness.
- `/wallet analyze` — live native balance snapshot on Ethereum and Solana through public JSON-RPC.
- `/wallet watch-add`, `watch-remove`, `watch-list` — per-server watchlist backed by PostgreSQL.
- `/whale latest`, `/token scan`, `/alerts status` — honest readiness responses until indexed sources and alert workers are integrated.

No private keys, seed phrases, custody, signing or automated trading. A large transfer is not automatically a buy or sell. No token is declared safe from incomplete evidence.

## Requirements
Node.js 20+, Discord bot with `bot` and `applications.commands` scopes. PostgreSQL is optional for wallet analysis and required for watchlists.

## Environment
Set `DISCORD_TOKEN`, `CLIENT_ID`, optional `GUILD_ID`, and optional `DATABASE_URL`. RPC endpoints can be overridden with `ETHEREUM_RPC_URL` and `SOLANA_RPC_URL`.

Apply `db/schema.sql` to PostgreSQL before using wallet watchlist commands.

## Run
```bash
npm install
npm run deploy
npm start
```

## Data integrity
RPC balances are live snapshots, not complete histories. Provider errors and limits are surfaced; no synthetic market data is returned. Guild database queries are scoped by guild_id. PostgreSQL timestamps use UTC.

## Roadmap
Provider health and quotas; indexed transfers; evidence-based token risk indicators; alert polling/deduplication/delivery; multi-chain expansion; subscriptions after product validation.
