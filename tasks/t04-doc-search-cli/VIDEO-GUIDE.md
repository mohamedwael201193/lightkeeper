# T04 — Doc-Search CLI: Video Guide (45–90s)

**Status:** PENDING-VIDEO (script + shots below; film in one terminal take, no edits to outputs).
**Total:** ~90 seconds. Film at 1080p, terminal font ≥16pt. Every command below is real;
the expected outputs are pasted from actual runs on 2026-10-16 — do NOT retype or "clean up" outputs.

## Shot list

### Shot 1 — The ask (0:00–0:18)
**On screen:** clean terminal in `tasks/t04-doc-search-cli/`. Type and run:

```
./pharos-docs "how do I deploy a contract?"
```

**Expected real output (first lines):**
```
QUESTION
  how do I deploy a contract?

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> npx hardhat ignition deploy ./ignition/modules/Token.js --network pharos
-- Write Your First Uniswap Contract
   Source: https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-uniswap-contract (retrieved 2026-10-16)
```

**Say:** "Doc-Search CLI. You ask a Pharos developer question in plain language, and it answers
from a local index of the real docs — never from memory, never invented."

### Shot 2 — Citation discipline (0:18–0:35)
**On screen:** scroll the Shot 1 output; cursor highlights the `Source:` line with URL + retrieval date,
then the `LABEL: DOC-GROUNDED` line.

**Say:** "Every answer carries exactly one label. Doc-grounded means a quoted excerpt plus the doc
URL and the date the docs were fetched. The label is the whole point — the tool would rather say
nothing than make something up."

### Shot 3 — A recommendation question (0:35–0:52)
**On screen:** run:

```
./pharos-docs "which oracle should I use for price feeds on Pharos"
```

**Expected real output (first citation):**
```
> - For price/market data, prefer Chainlink as the default oracle provider — use Chainlink Push Engine Feeds when your contract should react automatically to on-chain updates without polling, or Chainlink Data Feeds for low-latency, on-demand/pull consumption.
-- Pharos Documentation Index — Defaults
   Source: https://www.pharos.xyz/llms.txt (retrieved 2026-10-16)
```

**Say:** "For 'which should I use' questions it surfaces the docs' own documented defaults —
here, Chainlink as the default oracle provider — quoted word for word, with the source."

### Shot 4 — The miss (0:52–1:08)
**On screen:** run:

```
./pharos-docs "what is the birthday of the Pharos CEO"; echo "exit: $?"
```

**Expected real output:**
```
LABEL: UNVERIFIED

No good answer found. The indexed Pharos docs (438 passages, retrieved 2026-10-16) contain no passage covering this question above the confidence threshold, so this tool will not improvise an answer.
exit: 2
```

**Say:** "And when the docs don't cover it — exit code two, label unverified, no answer. It refuses
to improvise. That refusal is the feature."

### Shot 5 — Proof it holds (1:08–1:20)
**On screen:** run `python3 -m unittest tests.test_cli` → `Ran 14 tests … OK`.

**Say:** "Fourteen tests, all passing — including tests that assert the tool refuses to answer when
the index has no covering passage, and that every quote is traceable to the fetched docs."

### Shot 6 — From question to command in the console (1:20–1:30)
**On screen:** `https://lightkeeper-console.vercel.app/#/task/doc-search-cli` — type
"how do I deploy a contract?", show the DOC-GROUNDED card (verbatim quote + doc citation), then copy
the mapped `./pharos-docs` command. Then tap one of the "Watch the refusal" chips (the birthday of
the Pharos CEO) and show the UNVERIFIED card.

**Say:** "And the fastest honest path from question to command: the LIGHTKEEPER console gives you the
doc-grounded answer with its citation and the exact command that produces it — copy, paste, run.
And the refusal travels with it: the console's one-tap refusal demos prove it would rather say
nothing than make something up. It never invents."

## Filming notes

- One continuous terminal session; no cuts inside a command's output.
- If any output differs from what's pasted above (docs updated, index rebuilt), film what's real
  and note the new retrieval date on screen — never paste old output over a new run.
- No background music over the miss shot; let the refusal land.
- End card (2s): `github.com/mohamedwael201193/lightkeeper — tasks/t04-doc-search-cli` + "0 PHRS spent · stdlib only · no network at answer time".
