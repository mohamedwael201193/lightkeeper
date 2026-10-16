# T13 — Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, section
"### T13 — Docs MCP + Chain MCP Agent (Medium, 100 · Composition)".

> **OFFICIAL:** (1) Explanation comes from Docs MCP WITH sources referenced. (2) Agent then calls the SAME function on-chain via Chain MCP. (3) Interprets result in context of explanation. (4) Works for ≥2 different functions/contracts.
>
> **Implementation:** loop: Docs-MCP-explains → Chain-MCP-`eth_call` → interpret. Demonstrate on 3 calls to doubly satisfy "≥2" (e.g. `totalSupply`+`decimals` on an ERC-20, `owner()` on a second contract, bonus `balanceOf`). Citation validator; fails closed on missing sources.
>
> **Evidence:** Q&A with cited sources, on-chain calls + interpretations, share link.
>
> **Video:** question → docs answer with sources → same function called on-chain → interpreted result → second function.
>
> **Risks:** docs thinness on a function (say so, pick covered functions); selector correctness.

Related (MEGA §228, citation discipline — applies to T13 scoring):

> **Citation discipline (scores in T04/T13/T27):** every technical answer carries DOC-GROUNDED (doc URL + date + excerpt) / INFERENCE / UNVERIFIED labels. T27's coverage gate: if docs don't cover it, the agent must SAY SO — never improvise.

Related (MEGA §240, composition):

> **Composition (T12/T13):** on ai.pharos.xyz the agent holds both Chain MCP tools and SkillEngine actions in one session — read live state via MCP → invoke skill on that data → verify via MCP.

How this build satisfies each bullet — see README.md §2 and REVIEWER_NOTES.md.
