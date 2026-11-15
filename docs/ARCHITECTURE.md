# TERA ON-CHAIN — Architecture & MVP Plan

## Product decisions

- Discord-native bot; first deployed in the owner's server, designed for multiple guilds.
- Free/test API tiers only for the first MVP. Respect provider quotas and terms; no scraping or quota circumvention.
- Crypto subscription payments are planned, but payment collection is not part of the first technical milestone.
- Read-only intelligence: never request seed phrases/private keys and never sign transactions or execute trades.
- Initial chains: Ethereum and Solana. Bitcoin, BNB Chain, Base and Polygon are later adapters.
- Initial modules: whale activity, wallet analysis/watchlists, token risk checks, configurable alerts.

## MVP scope

### Included
1. Discord onboarding and per-guild configuration.
2. `/onchain` dashboard.
3. `/wallet analyze <chain> <address>` using public chain data.
4. `/wallet watch add|remove|list` with per-guild watchlists.
5. `/whale latest <chain>` using provider-supported large-transfer data.
6. `/token scan <chain> <address>` with transparent risk indicators and source links.
7. `/alerts setup` to select a channel and thresholds.
8. Per-guild quotas, rate limiting, structured logs and health checks.

### Not in MVP
- Automated trading, copy trading, wallet custody or private-key handling.
- Claims that a wallet owner is known or that a token is certainly safe/fraudulent.
- Full historical PnL attribution unless complete cost-basis data is available.
- Paid subscriptions until data cost, abuse controls and crypto payment verification are tested.
- Multi-chain real-time coverage of every network. Add chains one adapter at a time.

## Proposed repository structure

```text
TERA-ON-CHAIN/
├── src/
│   ├── bot/
│   │   ├── client.js
│   │   ├── register-commands.js
│   │   └── interaction-router.js
│   ├── commands/
│   │   ├── onchain.js
│   │   ├── wallet.js
│   │   ├── whale.js
│   │   ├── token.js
│   │   └── alerts.js
│   ├── modules/
│   │   ├── wallet/
│   │   ├── whale/
│   │   ├── token-risk/
│   │   └── alerts/
│   ├── chains/
│   │   ├── chain-adapter.js
│   │   ├── evm/
│   │   │   ├── ethereum.js
│   │   │   └── evm-utils.js
│   │   ├── solana/
│   │   │   └── solana.js
│   │   └── providers/
│   │       ├── provider-router.js
│   │       └── provider-health.js
│   ├── services/
│   │   ├── guild-config-service.js
│   │   ├── quota-service.js
│   │   ├── alert-service.js
│   │   └── subscription-service.js
│   ├── database/
│   │   ├── pool.js
│   │   └── repositories/
│   ├── jobs/
│   │   ├── poll-wallets.js
│   │   └── dispatch-alerts.js
│   ├── ui/
│   │   ├── embeds/
│   │   └── components/
│   ├── config/
│   │   └── env.js
│   └── index.js
├── db/
│   └── schema.sql
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── ARCHITECTURE.md
│   └── API-SOURCES.md
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Database approach

Use PostgreSQL. Every guild-owned record includes `guild_id`; repository methods must scope reads and writes by guild. Never rely on Discord channel visibility as a data-isolation boundary.

Core tables:
- `guilds`: installed Discord servers and configuration.
- `tracked_wallets`: addresses watched by a guild.
- `alert_rules`: user-defined conditions and destination channel.
- `alert_events`: deduplicated alerts delivered or awaiting delivery.
- `token_scans`: timestamped scan results and evidence metadata.
- `subscriptions`: future plan/entitlement state.
- `crypto_payment_intents`: future payment requests and verified transaction hashes.
- `usage_events`: quota accounting and provider-cost observability.

## Provider strategy

Use a provider adapter interface so the application does not depend on one vendor. Start with the free tiers of one EVM provider and one Solana provider, and a market-data source for prices. The provider router must:
- apply per-provider rate limits;
- cache repeat lookups;
- store provider name, retrieval time and source links;
- handle unavailable/partial data honestly;
- stop requests when quota is exhausted.

No provider key is exposed in Discord messages or committed to Git.

## Alert correctness

- Treat a transaction as confirmed only after the provider reports the required confirmation/finality state.
- Deduplicate by chain + transaction signature/hash + event index + rule.
- Separate transfers from swaps; a large transfer is not proof of a buy or sell.
- Explain that wallet labels and inferred links are probabilistic unless independently verified.
- Show UTC timestamp, chain, amount, asset, transaction link, source and confidence/limitations.

## Crypto subscription design (later phase)

Use an invoice/payment-intent model, not a wallet private key in the bot:
1. Create an invoice with chain, accepted token, expected amount, destination address and expiry.
2. Display a unique reference and exact payment instructions.
3. Verify the on-chain transfer independently, including token contract, destination, amount, chain, confirmations and transaction hash.
4. Enforce unique transaction-hash use and idempotent activation.
5. Activate entitlement only after verification; route ambiguous/underpaid/late payments to manual review.

Never store seed phrases or private keys. A public receiving address can be configured as an environment secret/config value, but the receiving wallet should be controlled outside the bot.

## MVP milestones

1. **Foundation:** replace store entrypoint, environment validation, Discord client, command registration, PostgreSQL connection and migrations.
2. **Guild tenancy:** install/config commands, guild config, permissions, quotas and audit logging.
3. **Wallet intelligence:** address validation, wallet summary, watchlist add/remove/list.
4. **Whale alerts:** supported large-transfer feed, thresholds, deduplication and Discord delivery.
5. **Token scanner:** contract metadata, liquidity/holder indicators where available, risk evidence and limitations.
6. **Hardening:** tests, provider failure handling, rate limits, backups, metrics and deployment runbook.
7. **Commercial phase:** subscription plans, crypto invoices, payment verification, entitlements and billing audit trail.

## Acceptance criteria for MVP

- A second test guild can install the bot without seeing the first guild's watchlists or alerts.
- No command reveals API keys or private wallet data.
- Repeated provider events do not create duplicate Discord alerts.
- Quota exhaustion produces a clear user-facing response instead of crashing.
- Every scan and alert includes source/time and clearly labels unavailable data.
- Bot can restart without losing configuration, watchlists or alert history.
