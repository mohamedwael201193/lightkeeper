# T20 — verified links (all curl-checked 2026-10-16)

| Link | Target | Check |
|---|---|---|
| Trigger tx | https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084 | HTTP 200 |
| Watched address | https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 | HTTP 200 |
| Atlantic explorer home | https://atlantic.pharosscan.xyz/ | — |
| Repo folder (commit-pinned after commit) | https://github.com/mohamedwael201193/lightkeeper/tree/bd2b759ee66c8240778d6a7052d914c99759ba6f/tasks/t20-onchain-alert-bot | fill on submit |
| Telegram delivery | bot `OctaneShift_Bot` → chat `1434154285`, message_id **717** | `sendMessage` ok=true (DMs have no public URL; message_id is the receipt) |
| Threshold trigger tx | https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a | curl-verified on run (block 31486611, status 0x1) |
| Threshold alerts | bot `OctaneShift_Bot` → chat `1434154285`, message_ids **727** (incoming-transfer) + **728** (large-transfer) | `sendMessage` ok=true, 2026-10-16T06:51:49Z/50Z |
| Ledger audit | `bash src/audit.sh` — replayed against live RPC 2026-10-16T07:27:32Z | 210 PASS, 0 FAIL (see `state/audit.log`) |
| Video | PENDING-VIDEO | see VIDEO-GUIDE.md |
