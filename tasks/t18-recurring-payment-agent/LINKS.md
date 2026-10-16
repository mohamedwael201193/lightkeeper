# LINKS — T18 (all verified 2026-10-16)

| Link | Target | Verified |
|---|---|---|
| Live installment tx | https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10 | `curl` → HTTP 200; receipt status 0x1, block 31481497, value 0.0005 PHRS, chain 688689 (via `cast receipt` / `cast tx`) |
| Atlantic explorer (network) | https://atlantic.pharosscan.xyz/ | `curl` → HTTP 200 |
| Repo dir (commit-pinned) | https://github.com/mohamedwael201193/lightkeeper/tree/e908ccad2ed744b3296f5853b6df181658704c87/tasks/t18-recurring-payment-agent | **NOT yet verifiable** — commit exists locally; operator pushes. Link becomes live after push. (Marked honestly; do not present as live.) |

## Verification commands used

```bash
# explorer page
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  "https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10"
# → HTTP 200

# on-chain receipt + value (via repo .env RPC)
cast receipt 0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10 \
  --rpc-url "$ATLANTIC_RPC_URL" --json
# → status 0x1, block 31481497
cast tx 0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10 \
  --rpc-url "$ATLANTIC_RPC_URL" --json
# → value 500000000000000 wei = 0.0005 PHRS, chainId 688689
```
