# TERA GSMG SOLVER

A dedicated Discord research bot for the GSMG.IO 5 BTC puzzle. Crypto trading, wallet tracking, store, and payment features have been removed from this project.

## Discord command
- `/gsmg status` — implemented and planned analysis modules.
- `/gsmg matrix` — reproduce the published 14×14 spiral extraction.
- `/gsmg sha256 text:` — hash exact UTF-8 input without trimming spaces or changing case.
- `/gsmg decrypt password:` — decrypt OpenSSL AES-256-CBC salted Base64 data; attach a text file for long blobs.
- `/gsmg beaufort text: key:` — run the Beaufort cipher.

## Existing hosting configuration
Keep the existing environment variable names:
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID` (optional, for fast guild command registration)

No new Discord application, database, or environment variable names are required.

## Start
```bash
npm start
```

## Verify
```bash
npm run verify
```
Expected matrix extraction: `gsmg.io/theseedisplanted`.

## Research integrity
Every candidate result must preserve the exact source input and transformation parameters. Unverified hypotheses are not recorded as solved stages. The bot never requests private keys or seed phrases.
