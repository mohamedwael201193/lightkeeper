> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/developer-guide/foundry.md).

# Foundry

This guide is suitable for developers who want to start building dApps using Pharos and Foundry toolchains. If you are a new user of Ethereum, please consider researching the [Ethereum documentation](https://ethereum.org/en/developers/docs/) before continuing.

## Write Your First Transaction

This guide will walk you through the process of sending your first transaction on the Pharos blockchain using three popular libraries: `ethers.js`, `web3.js`, and `web3.py`. By the end of this guide, you will understand how to send a transaction programmatically using these libraries.

### Prerequisites

Before you begin, ensure you have the following:

* Git: Used for code management and obtain examples.
* Pharos Devnet/Testnet Access: Access to a Pharos node (local or remote) for interacting with the blockchain.

### Setup 1: Pick Your Favorite Contract Develop Framework and IDE

Install your preferred contract framework from the below list:

* ethers.js
* web3.js
* web3.py

### Setup 2: Set Up the Project

Clone the example repo and add dependencies.

```sh
git clone https://github.com/PharosNetwork/examples
cd examples/transaction/ethersjs
npm install
```

```javascript
const { ethers } = require("ethers");

// Connect to Pharos Testnet
const provider = new ethers.providers.JsonRpcProvider("<PHAROS_RPC_URL>");

// Note: Your wallet private key (for testnet only, never expose this in production)
const privateKey = "YOUR_PRIVATE_KEY";
const wallet = new ethers.Wallet(privateKey, provider);

// Transaction details
const tx = {
    to: "RECIPIENT_ADDRESS", // Note: Replace with the recipient's address
    value: ethers.utils.parseEther("0.1"), // Amount to send (0.1 PHAR)
};

// Send the transaction
wallet.sendTransaction(tx)
    .then((transaction) => {
        console.log("Transaction sent:", transaction.hash);
    })
    .catch((error) => {
        console.error("Error sending transaction:", error);
    });
```

### Step 3: Run the Script

Run the script using Node.js:

<pre class="language-sh"><code class="lang-sh"><strong>node index.js
</strong></code></pre>

### Key Points

* **Private Key**: Never expose your private key in production. Use environment variables or secure storage.
* **Recipient Address**: Replace RECIPIENT\_ADDRESS with the actual recipient's wallet address.
* **Gas Limit**: Ensure you include a sufficient gas limit for the transaction.

### Troubleshooting

* **Transaction Fails**: Ensure you have enough testnet tokens to cover the transaction fee.
* **Incorrect Network**: Double-check that you are connected to the Pharos Testnet.
* **Invalid Address**: Verify that the recipient's address is correct.

### Conclusion

Now that you’ve sent your first transaction using ethers.js, web3.js, and web3.py.

This guide provides a comprehensive introduction to sending transactions on the Pharos blockchain using three popular libraries. If you encounter any issues, refer to the Troubleshooting section or consult the respective library's documentation. Happy building! 🚀


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/developer-guide/foundry.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
