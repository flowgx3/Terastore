# TRACE X · GSMG Research Bot

TRACE X repurposes the existing Discord bot for reproducible digital-puzzle research. Store features, payment flows, and crypto-trading functions are not part of this project.

## Discord commands

### GSMG
- `/gsmg status` — implemented solver modules.
- `/gsmg matrix` — reproduce the 14×14 spiral extraction.
- `/gsmg sha256 text:` — exact UTF-8 SHA-256.
- `/gsmg decrypt password:` — OpenSSL salted AES-256-CBC input; optional text-file attachment.
- `/gsmg beaufort text: key:` — Beaufort cipher.

### TRACE X research lab
- `/lab case-create` — create a research case.
- `/lab case-list` and `/lab case-show` — inspect cases.
- `/lab evidence-add` and `/lab evidence-list` — preserve text evidence and integrity hashes.
- `/lab hypothesis-add` and `/lab hypothesis-test` — track testable hypotheses and outcomes.
- `/lab analyze-text` — fingerprint text and test Base64/hex decoding candidates.
- `/lab asset-inspect` — inspect image/audio/binary headers, metadata where supported, and SHA-256; optionally attach the report to a case.

## Hosting

Keep the existing environment variable names:
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID` (optional; guild commands update faster)

No new Discord application or database is required. Start with `npm start`.

## Verification

Run:
```bash
npm run verify
npm run verify:research
```

## Research integrity

- Evidence gets a SHA-256 fingerprint.
- Hypotheses start as untested and are not presented as solved.
- Test outcomes require notes and remain distinct from verified facts.
- Asset inspection is read-only; it does not execute uploaded files.
- Uploaded asset bytes are analyzed in memory. Only the resulting report is saved to a case, not the binary itself.
- Local JSON research storage lives in `data/research/cases.json`; back it up because ephemeral hosts may reset local files.
- No private keys or seed phrases are requested or searched.
