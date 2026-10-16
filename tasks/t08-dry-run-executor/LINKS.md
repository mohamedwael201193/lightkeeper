# T08 — Links (every URL curl-verified, HTTP 200, 2026-10-16)

| # | What | URL | HTTP |
|---|---|---|---|
| 1 | Probe contract `DryRunProbe` | https://atlantic.pharosscan.xyz/address/0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f | 200 |
| 2 | Deploy tx `0xbb5fac…4748e44` (block 31481306) | https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44 | 200 |
| 3 | Scenario B real tx `0x639f87…012ee` (block 31481387, status success, 45,470 gas) | https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee | 200 |

Verification command used:

```bash
for u in \
 "https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44" \
 "https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee" \
 "https://atlantic.pharosscan.xyz/address/0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f"; do
  curl -s -o /dev/null -w "%{http_code}  $u\n" -m 20 "$u"
done
# 200 × 3
```

Repo (commit-pinned after commit):
`https://github.com/mohamedwael201193/lightkeeper/tree/044af202580c2764e987de109a7ccd083f08b9c2/tasks/t08-dry-run-executor`

Share/demo links: PENDING (portal surface unverified) — see `SUBMISSION.md`.
Video: PENDING-VIDEO — see `VIDEO-GUIDE.md`.
