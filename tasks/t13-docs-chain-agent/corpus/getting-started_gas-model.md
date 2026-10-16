> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/getting-started/gas-model.md).

# Gas Model

Understanding Gas Refund and Gas Limit in Pharos Transactions

## Overview

When sending a transaction on Ethereum or an EVM-compatible blockchain, it is essential to set an appropriate gas limit to ensure successful execution. One common issue arises when the gas limit is set exactly equal to the gas used, particularly when the transaction involves a gas refund mechanism.

## Summary Table

<table data-header-hidden><thead><tr><th width="219.41015625"></th><th></th></tr></thead><tbody><tr><td><strong>Feature</strong></td><td><strong>Details</strong></td></tr><tr><td>Opcode pricing</td><td>Fully aligned with Ethereum EVM opcode <a href="https://www.evm.codes/">gas table</a></td></tr><tr><td>EIP-1559 support</td><td>✅ Compatible (base fee + priority fee)</td></tr><tr><td>Base fee</td><td>Dynamic (recalculated per epoch)</td></tr><tr><td>Transaction fee model</td><td>Charged by gas_limit at inclusion time</td></tr><tr><td>Fee distribution</td><td>Base fee is burned; priority fee is credited to the validator</td></tr><tr><td>Refund logic</td><td>Full EVM-style refund tracking supported, but refund does not affect charge</td></tr></tbody></table>

## Transaction Fee Distribution

Following the EIP-1559 model, every transaction fee on Pharos is split into two components:

* **Base Fee** — the base fee is burned directly, permanently removing the corresponding tokens from circulation.
* **Priority Fee** — the priority fee (tip) is credited to the validator that produces the block, as a reward for including the transaction.

This fee-distribution mechanism is already implemented on Pharos.

### Difference from Ethereum

On Ethereum, the priority fee is credited to the block producer's address immediately after each transaction is executed. Pharos differs because of two core design choices:

* **Parallel execution & pipelined architecture** — to maximize performance, transactions are executed in parallel rather than sequentially.
* **Multi Concurrent Proposer (MCP) model** — multiple proposers can contribute to a single block.

Because transactions execute in parallel, priority fees cannot be settled at the granularity of individual transactions in real time. Instead, they are accumulated and credited to the corresponding validators in a batch at epoch boundaries.

## Best Practices for Developers

* **Set a slightly higher gas limit:** Allow extra gas beyond the expected execution cost.
  * Example: If you expect 100,000 gas used before refund, set the gas limit to 120,000 to avoid failures.
* **Use Estimation APIs:**
  * When sending transactions via Web3 libraries (`ethers.js`, `web3.js`), always use `estimateGas()` and add a buffer.
  * Example (`ethers.js`):

{% code fullWidth="false" %}

```javascript
const estimatedGas = await contract.estimateGas.someFunction();
const gasLimit = estimatedGas.mul(12).div(10); // Adding a 20% buffer
await contract.someFunction({ gasLimit });
```

{% endcode %}

* **Monitor Gas Refund Logic:**
  * If your contract relies heavily on gas refunds (e.g., clearing storage or `SELFDESTRUCT`), test transactions with different gas limits to find an optimal value.
* **Check for Out-of-Gas Failures:**
  * If a transaction fails unexpectedly despite having enough gas, check whether gas refunds are affecting execution.
  * Debug with `debug_traceTransaction` or EVM logs.

## Conclusion

To prevent transactions from failing due to gas refund issues, always set a gas limit slightly higher than the expected gas usage. This ensures smooth execution and prevents out-of-gas errors caused by refund mechanisms.

By following these best practices, developers can avoid failed transactions and improve the reliability of smart contract interactions.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/getting-started/gas-model.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
