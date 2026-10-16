> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token.md).

# Write Your First Token

This guide will walk you through the process of creating and deploying your first token on the Pharos blockchain. By the end of this guide, you will have a fully functional token contract and understand how to interact with it.

### Prerequisites

Before you begin, ensure you have the following:

* Git: Used for code management and obtain examples.
* Node.js: Install it from [nodejs.org](https://nodejs.org/).
* Pharos Devnet/Testnet Access: Access to a Pharos node (local or remote) for interacting with the blockchain.

### Setup 1: Install Foundry

* [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Setup 2: Set Up the Project

Clone the example repo:

```shell
git clone https://github.com/PharosNetwork/examples
cd examples/token/foundry/contract
```

Install OpenZeppelin Contracts:

* Foundry uses forge to manage dependencies. Install OpenZeppelin contracts:

```shell
forge install OpenZeppelin/openzeppelin-contracts --no-git
```

### Setup 3: Write the Token Contract

Create a New Solidity File:

* Create a new file for your token contract:

```shell
touch src/Token.sol
```

Write the Token Contract:

* Open `src/Token.sol` in your favorite text editor and add the following code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    constructor(uint256 initialSupply) ERC20("Token", "MTK") {
        _mint(msg.sender, initialSupply);
    }
}
```

Compile the Smart Contract:

* Use forge to compile the contract:

```sh
forge build
```

Test the Smart Contract

* Use forge to test the contract:

```shell
forge test
```

### Step 4: Deploy the Token Contract

Create a Deployment Script:

* Create a new file for the deployment script:

```shell
touch script/DeployToken.s.sol
```

Write the Deployment Script:

* Open script/DeployToken.s.sol and add the following code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/Token.sol";

contract DeployToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        Token token = new Token(1000000); // Initial supply of 1,000,000 tokens

        vm.stopBroadcast();
    }
}
```

Set the private key:

```shell
export PRIVATE_KEY=<your private key>
```

Deploy the Contract:

* Use forge to deploy the contract to the Pharos Testnet:

```shell
forge script script/DeployToken.s.sol --rpc-url <PHAROS_RPC_URL> --broadcast
```

### Step 5: Verify the Token Contract

* For Atlantic Testnet

```shell
forge verify-contract \
<contract_address> \
--constructor-args <abi_encoded_args> \
src/Token.sol:Token \
--chain-id 688688 \
--verifier blockscout \
--verifier-url https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract
```

* For Testnet

```shell
forge verify-contract \
<contract_address> \
--constructor-args <abi_encoded_args> \
src/Token.sol:Token \
--chain-id 688689 \
--verifier blockscout \
--verifier-url https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract
```

> Note: Replace with your token contract address

### Step 6: Interact with the Token Contract

Open `script/InteractToken.s.sol` and add the following code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Token} from "../src/Token.sol";

contract InteractToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        Token token = Token(address(0x00)); // Replace with your token contract address

        // Check balance
        uint256 balance = token.balanceOf(msg.sender);
        console.log("Balance:", balance);

        // Transfer tokens
        token.transfer(address(0x00), 100); // Replace with recipient address and amount
        console.log("Tokens transferred");

        vm.stopBroadcast();
    }
}
```

Execute the script using forge:

```shell
forge script script/InteractToken.s.sol --rpc-url <PHAROS_RPC_URL> --broadcast
```

### Troubleshooting

* **Contract Deployment Fails**: Ensure you have enough testnet tokens to cover the deployment cost.
* **Interaction Issues**: Verify that the contract address and ABI are correct.
* **Insufficient Balance**: Ensure your wallet has enough tokens to transfer.

### Next Steps

Now that you’ve created and deployed your first token using Foundry.

This guide provides a comprehensive introduction to creating and deploying a token on the Pharos blockchain using Foundry. If you encounter any issues, refer to the Troubleshooting section or consult the Foundry documentation. Happy building! 🚀


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
