# VIDEO GUIDE — T14 Portfolio Assistant (45–90 seconds)

**Format:** screen recording, terminal + browser. No face needed. No staged fakes — every
number on screen is a live read from Pharos Atlantic testnet. If the RPC is slow, keep
the real waiting in the video (it proves the reads are live).

## Shot-by-shot script

### Shot 1 — title (0:00–0:08)
Terminal open in `tasks/t14-portfolio-assistant/`. Type:

```
node bin/run.mjs --help
```

**Say:** "T14 Portfolio Assistant. Read-only portfolio reports for a Pharos Atlantic
wallet. It cannot sign or broadcast anything — there is no key anywhere in this folder."

### Shot 2 — question → cited answer (0:08–0:30)
Run:

```
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --question "What tokens do I hold?"
```

Wait for the real RPC reads. Point at the output lines.

**Say:** "I ask which tokens the wallet holds. Every balance comes back with its source
contract and block — native PHRS, USDC, and LPK, a test token I deployed for this task.
Testnet assets have no market value, so balances are in token units only — no USD is
ever invented."

### Shot 3 — second question type (0:30–0:45)
Run:

```
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --question "What is my recent activity?"
```

**Say:** "Recent activity is read from real Transfer events on-chain. The answer prints the
exact block window scanned — what it didn't scan, it doesn't claim to know."

### Shot 4 — the "I don't know" (0:45–1:05)
Run:

```
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --question "What is my portfolio worth in USD?"
```

**Say:** "Now the honest path. Ask for a dollar value and it refuses — Atlantic testnet
assets have no market value and there is no price feed. It will never invent a price."

### Shot 5 — write-attempt refusal (1:05–1:25)
Open `src/index.mjs` in an editor, point at the header comment; then in the terminal:

```
grep -ri "private.key\|signer\|broadcast" src/ bin/ | head
```

(show no results / only comments)

**Say:** "And it cannot transact — no private key, no signer, no broadcast anywhere in
the code. The only on-chain write in this task's history is the test-token deployment,
done by the operator, never by the assistant."

### Shot 6 — explorer proof (1:25–1:35, optional)
Browser: open https://atlantic.pharosscan.xyz/tx/0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23
— the real LPK deployment transaction.

**Say:** "The LPK token in the portfolio is real — here is its deployment on the
Atlantic explorer."

## Rules for this video

- REAL terminal output only. If a command fails, keep the failure and explain it — do
  not re-record over it with a fake success.
- Never display a private key, mnemonic, or `.env` contents on screen.
- Keep it under 90 seconds; one take is fine.
- Status: **PENDING-VIDEO** — slot reserved in task.yaml; record after this build.

## Bonus angle — console "try it live" (15–20s add-on or standalone clip)

Film lightkeeper-console.vercel.app → T14 lamp → "Try it live" section:

1. **Connect wallet** — click the console's wallet connect (MetaMask, Atlantic
   testnet). **Say:** "Now the wallet-interactive surface. I connect my own wallet —
   the console proposes nothing, signs nothing, reads only."
2. **Your own portfolio appears** — point at the live table: PHRS balance plus
   every registry token, each row linking to its contract on the explorer, the
   read pinned to the current block with the outgoing tx count. **Say:** "The first
   thing I see is my own portfolio, read live from Atlantic — block-pinned, every
   number citable, and still no dollar values invented."
3. **Paste an address** — disconnect, paste the keeper's wallet
   `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`, read it. **Say:** "No wallet
   needed either — any valid address reads the same way. The keeper's reference
   below it is the task's historical evidence snapshot, clearly labeled as such."
4. **Honesty line (say it on camera):** "Reads are free and need no signature —
   LIGHTKEEPER never sees your keys, because it never asks for them."

Status: **PENDING-VIDEO** — record alongside the terminal shots; the browser
surface needs no wallet with funds, a read-only connect is enough.
