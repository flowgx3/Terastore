# TRACE X Research Engine

TRACE X is the research layer for the existing GSMG Discord bot. It adds a persistent case ledger and deterministic text-analysis primitives without introducing a new Discord application or changing the existing environment variables.

## Research integrity
- Each case stores evidence, hypotheses, and experiment records separately.
- Evidence text is preserved as supplied and receives a SHA-256 fingerprint.
- Hypotheses begin as `untested`; they are not presented as discoveries.
- Supported/rejected outcomes must be recorded with test notes.
- Analysis is deterministic and does not silently alter whitespace or case.

## Current modules
- `src/research/store.js`: local JSON case/evidence/hypothesis ledger.
- `src/research/engine.js`: exact-input fingerprinting and strict Base64/hex candidate decoding.
- `src/gsmg/core.js`: GSMG matrix extraction and existing cipher utilities.

## Storage
Research records are stored in `data/research/cases.json` on the host filesystem. Back up this file before replacing the hosting container. A future database adapter can replace this storage layer without changing the research model.

## Safety and boundaries
The engine analyzes puzzle artifacts supplied by the researcher. It does not search random private keys, request seed phrases, or attempt access to third-party wallets/accounts. Never upload credentials or secrets as puzzle evidence.

## Roadmap
1. Integrate `/lab` case/evidence/hypothesis commands into the Discord interface.
2. Add immutable asset ingestion with file size/type limits and content hashes.
3. Add image/audio analysis workers and reproducible transformation pipelines.
4. Add evidence graph export (JSON/Graphviz) and report generation.
5. Add optional LLM-assisted hypothesis ranking with explicit citations to evidence; deterministic verification remains authoritative.
