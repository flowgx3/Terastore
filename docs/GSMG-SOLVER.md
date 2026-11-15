# TERA GSMG SOLVER

A separate Discord application for reproducible analysis of the public GSMG.IO 5 BTC puzzle. It does not replace or modify the existing TERA ON-CHAIN bot.

## First modules
- `/gsmg status` — implemented vs not-yet-imported evidence.
- `/gsmg matrix` — re-runs the published 14×14 spiral extraction.
- `/gsmg sha256 text:` — SHA-256 of exact UTF-8 input (preserves spaces/case).
- `/gsmg decrypt` — OpenSSL-compatible AES-256-CBC salted Base64 decryption, with MD5 or SHA-256 KDF selection.
- `/gsmg beaufort` — Beaufort cipher.

## Run
Set `GSMG_DISCORD_TOKEN`, `GSMG_CLIENT_ID`, and optionally `GSMG_GUILD_ID` in the host environment. Then run:
```bash
node src/gsmg-bot.js
```
Commands are registered automatically at startup. Use a separate Discord application/token from TERA ON-CHAIN so the two clients do not compete for the same gateway session.

## Verification
```bash
node -e "const c=require('./src/gsmg/core'); console.log(c.decodeMatrix().text)"
```
Expected matrix output: `gsmg.io/theseedisplanted`.

## Evidence policy
Source ciphertexts and assets must be imported unchanged and hashed before analysis. A candidate result is not a solution until its exact input, transformation, parameters, and output can be independently reproduced. No private-key guessing, wallet access, or prize-claim automation is included.
