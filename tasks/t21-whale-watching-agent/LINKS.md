# T21 — Links (all curl-tested 2026-10-16)

## On-chain evidence (Atlantic testnet)

| Link | Verified | Notes |
|---|---|---|
| https://atlantic.pharosscan.xyz/tx/0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70 | HTTP 200 | Self-seeded whale transfer: 0.05 PHRS, deployer → sink, block 31482165 |
| https://atlantic.pharosscan.xyz/tx/0x5025f6a86ad873b6a8a3eb72a3f4c0a9081e86d29347cd51bc2dc756175be470 | HTTP 200 | Organic whale: 0.05 PHRS, block 31482112 |
| https://atlantic.pharosscan.xyz/tx/0x6b9e96a814cc7b0dd8ef2e6e0617351c883ecfb439f0573dd23380535b7fb237 | HTTP 200 | Organic whale: 0.05 PHRS, block 31482185 |
| https://atlantic.pharosscan.xyz/block/31482165 | HTTP 200 | Seed block |
| https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 | HTTP 200 | LIGHTKEEPER deployer wallet (self) |
| https://atlantic.pharosscan.xyz/address/0x7D5Bbc5E294896860278134Da3898171043B2a5e | HTTP 200 | T21 self-seed sink (task-controlled) |

Verification method: `curl -s -o /dev/null -w "%{http_code}"` per URL (pharosscan is a
JS SPA; HTTP 200 with content = the route resolves).

## Repo

| Link | Verified | Notes |
|---|---|---|
| https://github.com/mohamedwael201193/lightkeeper/tree/050bfbf/tasks/t21-whale-watching-agent | formed, not yet resolvable | Commit-pinned per Arena pack convention. **NOT pushed** (per task orders: commit only, no push) — resolves once the founder pushes. Repo root `mohamedwael201193/lightkeeper` verified live at build kickoff (PAT auth as `devmo`). |

## Video

PENDING-VIDEO — film with `VIDEO-GUIDE.md`, then add the link here and in `SUBMISSION.md`.
