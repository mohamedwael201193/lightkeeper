> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/tooling-and-infrastructure/block-explorer/hemera-socialscan.md).

# Hemera SocialScan

## Overview

Hemera SocialScan is the official block explorer for the Pharos Network. It provides real-time visibility into on-chain activity, allowing developers and users to inspect transactions, blocks, accounts, tokens, and smart contracts.

For developers, the explorer provides a familiar interface of EVM that includes tools for contract verification, token analytics, and transaction debugging.

## Explorer Access

| Parameter                                  | Value                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explorer Link                              | <https://pharos.socialscan.io/>                                                                                                                          |
| Developer APIs (Contract Verification API) | [`https://api.socialscan.io/pharos-mainnet/v1/explorer/command_api/contract`](https://api.socialscan.io/pharos-mainnet/v1/explorer/command_api/contract) |
| Explorer Developer API Key                 | `102dfc05-661d-4efd-a81e-24afb3918c7f`                                                                                                                   |

## What You Can Do

Hemera SocialScan supports common developer workflows:

* View and track transactions in real time
* Inspect blocks and network activity
* Explore wallet addresses, balances, and interactions
* View deployed smart contracts and their state
* Verify smart contracts and access source code
* Analyze token activity and transfers

## Contract Verification

You can verify deployed smart contracts using the SocialScan Developer API.

## Notes

* Ensure your contract is compiled with the correct settings before verification
* Verification may fail if bytecode or compiler settings do not match
* Use the explorer alongside your preferred framework (Foundry, Hardhat) for a smoother workflow

## Next Steps

* Verify your deployed contracts
* Use the explorer to debug and monitor transactions
* Combine with RPC and indexing tools for deeper insights


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/tooling-and-infrastructure/block-explorer/hemera-socialscan.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
