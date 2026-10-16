# T25 — Links (all curl-verified HTTP 200 on 2026-10-16)

## On-chain evidence (Pharos Atlantic testnet)

| Link | What it proves |
|---|---|
| https://atlantic.pharosscan.xyz/tx/0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23 | Failure #1 — revert with reason (`boom()`), status 0, block 31482154 |
| https://atlantic.pharosscan.xyz/tx/0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf | Failure #2 — out of gas (gasUsed == gasLimit == 120000), block 31482265 |
| https://atlantic.pharosscan.xyz/tx/0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048 | Failure #3 (bonus) — Panic(0x11) overflow, block 31482171 |
| https://atlantic.pharosscan.xyz/address/0xC987a20fEEDc38772cE0786c3233148586a67e53 | Fixture contract TestReverter v2 (diagnostic fixture, Atlantic only) |
| https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 | Builder wallet (shared LIGHTKEEPER deployer) |

## Doc sources grounding the Q&A (fetched 2026-10-16)

| Link | Used for |
|---|---|
| https://www.pharos.xyz/llms.txt | Docs index + recommended tooling defaults (KB entry `docs-index-defaults`) |
| https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md | Chain ID 688689, rate limits (KB entry `atlantic-testnet-params`) |
| https://docs.pharos.xyz/getting-started/faqs.md | Out-of-gas gas-limit/refund mechanism (KB entry `gas-model-faq` + diagnose citations) |

## Repo (commit-pinned after commit)

- `https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t25-dapp-support-agent` — filled in SUBMISSION.md at commit time.
