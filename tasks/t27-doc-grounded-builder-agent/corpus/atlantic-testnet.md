> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md).

# Atlantic Testnet

## Network Information

| Parameter              | Value                                  |
| ---------------------- | -------------------------------------- |
| RPC Public Endpoint    | <https://atlantic.dplabs-internal.com> |
| WSS Public Endpoint    | <wss://atlantic.dplabs-internal.com>   |
| Explorer               | <https://atlantic.pharosscan.xyz/>     |
| ChainID                | 688689                                 |
| Environment            | Atlantic Testnet                       |
| Ratelimit              | 500 times/5m                           |
| Max Pending TXs (Addr) | 64                                     |

> For the current node binary and Docker image versions, see [Current Node Versions](/node-and-validator-guide/validator-node-deployment.md#current-node-versions).


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
