# T01 · VIDEO-GUIDE (45–90 seconds — real output only, NO staged fakes)

**Rule zero:** every pixel must be real — real terminal, real explorer page,
real tx. If a command fails on camera, keep it in and narrate the recovery;
a recovered failure beats a staged success.

## Shot list

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Title card (OCTOPUS style: gold serif on `#1414c8`): "T01 · READ CONTRACT STATE — the keeper reads the stone before lighting the lamp." | "Lamp one of twenty-eight. T01: read contract state — live, on Pharos Atlantic." |
| 2 | 8–20s | Browser: explorer contract page `atlantic.pharosscan.xyz/address/0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD` — scroll the tx list. | "This is KeeperRegistry, deployed for this task — real contract, real chain, chain ID 688689." |
| 3 | 20–28s | Browser: deploy tx page `…/tx/0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b` — point at status Success, block 31481260. | "One deploy transaction, block 31481260, status success. That's the only transaction this task ever sends." |
| 4 | 28–55s | Terminal: run `bin/read-contract-state.sh` live. Let it print. Highlight: pinned block line, the 8 values, `3.000000 lamps`, labelled keeper address, the VERIFIED slot-check line. | "Now the reader: chain asserted, block pinned, eight typed values — raw hex, decoded, human. Decimals come from the contract itself, and the mapping slot is proven, not asserted." |
| 5 | 55–70s | Terminal: run `bin/read-contract-state.sh --negative` — show both OK-LOUD lines. | "And the failure paths: empty address, unknown selector — both fail loudly. No silent zeros, no mock data, anywhere." |
| 6 | 70–80s | Editor: README.md open at the sample-output section + evidence manifest. | "README, per-run evidence manifest, transcripts, and a test suite that re-reads everything through an independent path. Lamp one: lit." |

## Filming notes

- Terminal font ≥16pt, window maximized; hide API keys (none are needed — reading is keyless).
- Record the explorer pages with the URL bar visible so the tx hash is legible.
- No voiceover effects, no background music over the terminal — clarity wins.
- Export 1080p, upload unlisted, paste the URL into SUBMISSION.md replacing `PENDING-VIDEO`.
- Length target: **60–75s**. Under 45s feels thin; over 90s loses the reviewer.
