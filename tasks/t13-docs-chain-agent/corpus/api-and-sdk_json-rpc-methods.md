> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md).

# JSON-RPC API Methods

Pharos Network is a fully EVM-equivalent Layer 1 blockchain, supporting a [JSON-RPC](https://www.jsonrpc.org/specification) interface for seamless blockchain interactions. This RPC API is fully compatible with existing [Ethereum JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/) while also providing richer semantics and enhanced services.

## Standard Ethereum Methods

### eth\_gasPrice

Returns the current gas price in Wei.

* Input: None
* Output: `String` - Gas price in Wei

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_gasPrice",
  "params": [],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x2540be400"
}
```

### eth\_maxPriorityFeePerGas

Returns the priority fee needed to be included in a block (EIP-1559).

* Input: None
* Output: `String` - Priority fee in Wei

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_maxPriorityFeePerGas",
  "params": [],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x0"
}
```

### eth\_feeHistory

Returns historical gas information for fee estimation (EIP-1559).

* Input:
  * `String` - Number of blocks in the requested range
  * `String` - Highest block of the requested range
  * `Array` - Reward percentiles to sample from each block
* Output: `Object` - Fee history data including baseFeePerGas, gasUsedRatio, and reward

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_feeHistory",
  "params": [
    "0x5",
    "latest",
    [
      25,
      75
    ]
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "baseFeePerGas": [
      "0x2540be400",
      "0x2540be400",
      "..."
    ],
    "gasUsedRatio": [
      0.0,
      0.0,
      "..."
    ],
    "oldestBlock": "0x54ace7",
    "reward": [
      [
        "0x0",
        "0x0"
      ],
      [
        "0x0",
        "0x0"
      ],
      "..."
    ]
  }
}
```

### eth\_blockNumber

Returns the number of the most recent block.

* Input: None
* Output: `String` - Block number in hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_blockNumber",
  "params": [],
  "id": 1
}

// Response
{
  "result": "0x54aceb",
  "id": 1,
  "jsonrpc": "2.0"
}
```

### eth\_chainId

Returns the chain ID of the current network.

* Input: None
* Output: `String` - Chain ID as a hexadecimal string

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_chainId",
  "params": [],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x688"
}
```

### eth\_syncing

Returns the sync status of the node.

* Input: None
* Output: `Object|Boolean` - Sync status object, or `false` if not syncing

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_syncing",
  "params": [],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": false
}
```

### eth\_getBalance

Returns the balance of an address at a given block.

* Input:
  * `String` - Address to query
  * `String` - Block number or tag (`latest`, `earliest`, `pending`, `safe`, `finalized`)
* Output: `String` - Balance in Wei as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getBalance",
  "params": [
    "0x407d73d8a49eeb85d32cf465507dd71d507100c1",
    "latest"
  ],
  "id": 1
}

// Response
{"jsonrpc":"2.0","id":1,"result":"0x0234c8a3397aab58"}
```

### eth\_getTransactionCount

Returns the number of transactions sent from an address (nonce).

* Input:
  * `String` - Address to query
  * `String` - Block number or tag
* Output: `String` - Transaction count as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getTransactionCount",
  "params": [
    "0xfaC0718D882E5f07e1972D617bd430CD72A55D84",
    "latest"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0x2"
}
```

### eth\_getStorageAt

Returns the value from a storage position at a given address.

* Input:
  * `String` - Address of the contract
  * `String` - Position in storage
  * `String` - Block number or tag
* Output: `String` - Storage value as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getStorageAt",
  "params": [
    "0x4100000000000000000000000000000000000000",
    "0x0",
    "latest"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0x0000000000000000..."
}
```

### eth\_getCode

Returns the contract code at a given address.

* Input:
  * `String` - Address to query
  * `String` - Block number or tag
* Output: `String` - Contract bytecode as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getCode",
  "params": [
    "0x4100000000000000000000000000000000000000",
    "latest"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0x6080604052600a6012565b6022565b5f90565b6018600e565b50601f60b5565b..."
}
```

### eth\_getProof

Returns the account and storage values with Merkle proof (EIP-1186). Pharos supports [Simplified Payment Verification (SPV)](https://github.com/PharosNetwork/docs/blob/main/api-and-sdk/spv-proof-theory-explanation.md) using these proofs.

* Input:
  * `String` - Address
  * `Array` - Array of storage keys
  * `String` - Block number or tag
* Output: `Object` - Account proof including balance, codeHash, nonce, storageHash, and proofs

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getProof",
  "params": [
    "0x4100000000000000000000000000000000000000",
    [
      "0x0"
    ],
    "latest"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "accountProof": [
      {
        "nextBeginOffset": 0,
        "nextEndOffset": 32,
        "proofNode": "0xe02388eb3621238f..."
      },
      {
        "nextBeginOffset": 387,
        "nextEndOffset": 419,
        "proofNode": "0x0000005846b1739f..."
      },
      "..."
    ],
    "address": "0x4100000000000000000000000000000000000000",
    "balance": "0x34F086F3B33B684000000",
    "codeHash": "0xa556a9adc4732609...",
    "isExist": true,
    "nonce": "0x0",
    "rawValue": "0xef808b034f086f3b...",
    "storageHash": "0xd96ef1a22d793063...",
    "storageProof": [
      {
        "isExist": false,
        "key": "0x0000000000000000...",
        "proof": [
          {
            "nextBeginOffset": 0,
            "nextEndOffset": 32,
            "proofNode": "0xe02388eb3621238f..."
          },
          {
            "nextBeginOffset": 323,
            "nextEndOffset": 355,
            "proofNode": "0x0000005846b1739f..."
          },
          {
            "nextBeginOffset": 163,
            "nextEndOffset": 195,
            "proofNode": "0x000000186be0bf31..."
          },
          {
            "nextBeginOffset": 259,
            "nextEndOffset": 291,
            "proofNode": "0x00000036e93a5eef..."
          },
          {
            "nextBeginOffset": 259,
            "nextEndOffset": 291,
            "proofNode": "0x0000000000000000..."
          }
        ],
        "siblingLeftmostLeafProofs": [
          {
            "leftmostLeafKey": "0x32ec8cb089301315...",
            "proofPath": [
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015aa0b752210382..."
              }
            ],
            "slotIndex": 0
          },
          {
            "leftmostLeafKey": "0x319d86c4583accd6...",
            "proofPath": [
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015a63a0b7cfd891..."
              }
            ],
            "slotIndex": 3
          },
          {
            "leftmostLeafKey": "0x76c9cf548b4179f8...",
            "proofPath": [
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015aa46483878fad..."
              }
            ],
            "slotIndex": 4
          },
          {
            "leftmostLeafKey": "0xf1dcf78b36c5848c...",
            "proofPath": [
              {
                "nextBeginOffset": 227,
                "nextEndOffset": 259,
                "proofNode": "0x0000000000000000..."
              },
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015a758f88ba6af0..."
              }
            ],
            "slotIndex": 5
          },
          {
            "leftmostLeafKey": "0x76c9cf548b4179f8...",
            "proofPath": [
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015a690bf928e548..."
              }
            ],
            "slotIndex": 9
          },
          {
            "leftmostLeafKey": "0xc7f7e0e747d90acb...",
            "proofPath": [
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015a8b0d031d5cab..."
              }
            ],
            "slotIndex": 11
          },
          {
            "leftmostLeafKey": "0xf428e3a2624c4aac...",
            "proofPath": [
              {
                "nextBeginOffset": 0,
                "nextEndOffset": 0,
                "proofNode": "0x015a0ff2163c136f..."
              }
            ],
            "slotIndex": 15
          }
        ],
        "value": "0x"
      }
    ]
  }
}
```

### eth\_sendRawTransaction

Submits a signed transaction to the network. Supports legacy, EIP-2930 (access list), and EIP-1559 transaction types.

* Input:
  * `String` - Signed transaction data
* Output: `String` - Transaction hash

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_sendRawTransaction",
  "params": [
    "0xf86c0a8502540be400825208944bbeeb066ed09b7aed07bf39eee0460dfa261520880de0b6b3a7640000801ca0f3ae..."
  ],
  "id": 1
}

// Response
{"jsonrpc":"2.0","id":1,"result":"0xe670ec6434177160..."}
```

### eth\_call

Executes a message call without creating a transaction. Useful for reading contract state.

* Input:
  * `Object` - Transaction call object (from, to, gas, gasPrice, value, data)
  * `String` - Block number or tag
* Output: `String` - Return data as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_call",
  "params": [
    {
      "to": "0x4100000000000000000000000000000000000000",
      "data": "0x76671808"
    },
    "latest"
  ],
  "id": 1
}

// Response
{"jsonrpc":"2.0","id":1,"result":"0x0000000000000000..."}
```

### eth\_estimateGas

Estimates the gas needed to execute a transaction.

* Input:
  * `Object` - Transaction call object
  * `String` - Block number or tag (optional)
* Output: `String` - Estimated gas as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_estimateGas",
  "params": [
    {
      "to": "0x4100000000000000000000000000000000000000",
      "data": "0x76671808"
    }
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0x9d4b"
}
```

### eth\_createAccessList

Creates an EIP-2930 access list for a transaction.

> **Note:** This method is still under debugging and may return null values.

* Input:
  * `Object` - Transaction call object
  * `String` - Block number or tag
* Output: `Object` - Access list and estimated gas

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_createAccessList",
  "params": [
    {
      "to": "0x4100000000000000000000000000000000000000",
      "data": "0x76671808"
    },
    "latest"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "accessList": [
      {
        "address": "0x0000000000000000000000000000000000000000",
        "storageKeys": []
      },
      {
        "address": "0x0000000000000000000000000000000000000001",
        "storageKeys": []
      },
      "..."
    ],
    "gasUsed": "0x9d4b"
  }
}
```

### eth\_getBlockByHash

Returns information about a block by its hash.

* Input:
  * `String` - Block hash
  * `Boolean` - If `true`, returns full transaction objects; if `false`, returns transaction hashes
* Output: `Object` - Block information

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getBlockByHash",
  "params": [
    "0xfa15419fc3de49e27f62eff7be1f344a3fd156e332ea9a78337c73a0b2b6573a",
    false
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "baseFeePerGas": "0x2540be400",
    "difficulty": "0x0",
    "extraData": "0x0a0000010000003c...",
    "gasLimit": "0x3b9aca00",
    "gasUsed": "0x0",
    "hash": "0xfa15419fc3de49e2...",
    "logsBloom": "0x0000000000000000...",
    "miner": "0x0000000000000000000000000000000000000000",
    "mixHash": "0x0000000000000000...",
    "nonce": "0x0000000000000000",
    "number": "0x2710",
    "parentHash": "0x1ff0db61e7c714a9...",
    "receiptsRoot": "0x56e81f171bcc55a6...",
    "sha3Uncles": "0x1dcc4de8dec75d7a...",
    "size": "0x257",
    "stateRoot": "0xc5914a0db9663398...",
    "timestamp": "0x693c2fd1",
    "totalDifficulty": "0x0",
    "transactions": [],
    "transactionsRoot": "0x56e81f171bcc55a6...",
    "uncles": []
  }
}
```

### eth\_getBlockByNumber

Returns information about a block by its number.

* Input:
  * `String` - Block number or tag
  * `Boolean` - If `true`, returns full transaction objects
* Output: `Object` - Block information

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getBlockByNumber",
  "params": [
    "0x2710",
    false
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "baseFeePerGas": "0x2540be400",
    "difficulty": "0x0",
    "extraData": "0x0a0000010000003cc91a139b010000e3b0c44298fc1c149afbf4c8996fb92427...",
    "gasLimit": "0x3b9aca00",
    "gasUsed": "0x0",
    "hash": "0xfa15419fc3de49e2...",
    "logsBloom": "0x0000000000000000000000000000000000000000000000000000000000000000...",
    "miner": "0x0000000000000000000000000000000000000000",
    "mixHash": "0x0000000000000000...",
    "nonce": "0x0000000000000000",
    "number": "0x2710",
    "parentHash": "0x1ff0db61e7c714a9...",
    "receiptsRoot": "0x56e81f171bcc55a6...",
    "sha3Uncles": "0x1dcc4de8dec75d7a...",
    "size": "0x257",
    "stateRoot": "0xc5914a0db9663398...",
    "timestamp": "0x693c2fd1",
    "totalDifficulty": "0x0",
    "transactions": [],
    "transactionsRoot": "0x56e81f171bcc55a6...",
    "uncles": []
  }
}
```

### eth\_getBlockReceipts

Returns all transaction receipts for a given block.

* Input:
  * `String` - Block number or tag
* Output: `Array` - List of transaction receipts

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getBlockReceipts",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": []
}
```

### eth\_getBlockTransactionCountByHash

Returns the number of transactions in a block by block hash.

* Input:
  * `String` - Block hash
* Output: `String` - Transaction count as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getBlockTransactionCountByHash",
  "params": [
    "0xfa15419fc3de49e27f62eff7be1f344a3fd156e332ea9a78337c73a0b2b6573a"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x0"
}
```

### eth\_getBlockTransactionCountByNumber

Returns the number of transactions in a block by block number.

* Input:
  * `String` - Block number or tag
* Output: `String` - Transaction count as hexadecimal

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getBlockTransactionCountByNumber",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0x0"
}
```

### eth\_getTransactionByHash

Returns information about a transaction by its hash.

* Input:
  * `String` - Transaction hash
* Output: `Object` - Transaction details

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getTransactionByHash",
  "params": [
    "0xee093bb802e09fe6119e83d7fe35004464a98e69000bcd5672ac73b32172c997"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "blockHash": "0x1d13424e6a78ab6d...",
    "blockNumber": "0x4ff5de",
    "chainId": "0x688",
    "from": "0x7565f60988b83e577cb1a670ce577667311b11ae",
    "gas": "0x1380a5",
    "gasPrice": "0x2540be400",
    "hash": "0xee093bb802e09fe6...",
    "input": "0x6a76120200000000...",
    "nonce": "0x66",
    "r": "0xd7f06b78d1c679b4...",
    "s": "0x74b4c81773e6d4f0...",
    "to": "0xcce192445aa8118117e73554773e8be8617f31d0",
    "transactionIndex": "0x0",
    "type": "0x0",
    "v": "0xd34",
    "value": "0x0"
  }
}
```

### eth\_getTransactionByBlockHashAndIndex

Returns a transaction by block hash and index position.

* Input:
  * `String` - Block hash
  * `String` - Transaction index (hexadecimal)
* Output: `Object` - Transaction details

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getTransactionByBlockHashAndIndex",
  "params": [
    "0x1d13424e6a78ab6d9263e6e5f8c9026588d8ba6d2709127a241fbe53a57fd9d9",
    "0x0"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "blockHash": "0x1d13424e6a78ab6d...",
    "blockNumber": "0x4ff5de",
    "chainId": "0x688",
    "from": "0x7565f60988b83e577cb1a670ce577667311b11ae",
    "gas": "0x1380a5",
    "gasPrice": "0x2540be400",
    "hash": "0xee093bb802e09fe6...",
    "input": "0x6a76120200000000...",
    "nonce": "0x66",
    "r": "0xd7f06b78d1c679b4...",
    "s": "0x74b4c81773e6d4f0...",
    "to": "0xcce192445aa8118117e73554773e8be8617f31d0",
    "transactionIndex": "0x0",
    "type": "0x0",
    "v": "0xd34",
    "value": "0x0"
  }
}
```

### eth\_getTransactionByBlockNumberAndIndex

Returns a transaction by block number and index position.

* Input:
  * `String` - Block number or tag
  * `String` - Transaction index (hexadecimal)
* Output: `Object` - Transaction details

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getTransactionByBlockNumberAndIndex",
  "params": [
    "0x4ff5de",
    "0x0"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "blockHash": "0x1d13424e6a78ab6d...",
    "blockNumber": "0x4ff5de",
    "chainId": "0x688",
    "from": "0x7565f60988b83e577cb1a670ce577667311b11ae",
    "gas": "0x1380a5",
    "gasPrice": "0x2540be400",
    "hash": "0xee093bb802e09fe6...",
    "input": "0x6a76120200000000...",
    "nonce": "0x66",
    "r": "0xd7f06b78d1c679b4...",
    "s": "0x74b4c81773e6d4f0...",
    "to": "0xcce192445aa8118117e73554773e8be8617f31d0",
    "transactionIndex": "0x0",
    "type": "0x0",
    "v": "0xd34",
    "value": "0x0"
  }
}
```

### eth\_getTransactionReceipt

Returns the receipt of a transaction by transaction hash.

* Input:
  * `String` - Transaction hash
* Output: `Object` - Transaction receipt

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getTransactionReceipt",
  "params": [
    "0xee093bb802e09fe6119e83d7fe35004464a98e69000bcd5672ac73b32172c997"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "blockHash": "0x1d13424e6a78ab6d...",
    "blockNumber": "0x4ff5de",
    "contractAddress": null,
    "cumulativeGasUsed": "0xea376",
    "effectiveGasPrice": "0x2540be400",
    "from": "0x7565f60988b83e577cb1a670ce577667311b11ae",
    "gasUsed": "0xea376",
    "logs": [
      {
        "address": "...",
        "blockHash": "...",
        "blockNumber": "...",
        "blockTimestamp": "...",
        "data": "...",
        "logIndex": "...",
        "removed": "...",
        "topics": "...",
        "transactionHash": "...",
        "transactionIndex": "..."
      },
      {
        "address": "...",
        "blockHash": "...",
        "blockNumber": "...",
        "blockTimestamp": "...",
        "data": "...",
        "logIndex": "...",
        "removed": "...",
        "topics": "...",
        "transactionHash": "...",
        "transactionIndex": "..."
      },
      {
        "address": "...",
        "blockHash": "...",
        "blockNumber": "...",
        "blockTimestamp": "...",
        "data": "...",
        "logIndex": "...",
        "removed": "...",
        "topics": "...",
        "transactionHash": "...",
        "transactionIndex": "..."
      }
    ],
    "logsBloom": "0x0000000040000000...",
    "status": "0x1",
    "to": "0xcce192445aa8118117e73554773e8be8617f31d0",
    "transactionHash": "0xee093bb802e09fe6...",
    "transactionIndex": "0x0",
    "type": "0x0"
  }
}
```

### eth\_getLogs

Returns logs matching a given filter object.

* Input:
  * `Object` - Filter parameters (fromBlock, toBlock, address, topics)
* Output: `Array` - List of log entries

> **Note:** Block range is limited to 100 blocks when rate limiting is enabled, or 10,000 blocks as a fallback cap.

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getLogs",
  "params": [
    {
      "fromBlock": "0x1",
      "toBlock": "0x64",
      "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      "topics": [
        "0xddf252ad1be2c89b..."
      ]
    }
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "address": "0x742d...f44e",
      "topics": [
        "0xddf252...b3ef",
        "0x000000...sender",
        "0x000000...receiver"
      ],
      "data": "0x0000000000000000...",
      "blockNumber": "0x50",
      "transactionHash": "0xabc123...",
      "logIndex": "0x0"
    }
  ]
}
```

### eth\_subscribe

Creates a subscription for real-time events (WebSocket only).

* Input:
  * `String` - Subscription type: `newHeads` or `logs`
  * `Object` - Filter parameters (for `logs` type only)
* Output: `String` - Subscription ID

> **Note:** Only available over WebSocket connections. HTTP calls will fail.

**Example:**

```json
// Request (newHeads subscription)
{
  "jsonrpc": "2.0",
  "method": "eth_subscribe",
  "params": ["newHeads"],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x1"
}

// Subsequent notification
{
  "jsonrpc": "2.0",
  "method": "eth_subscription",
  "params": {
    "subscription": "0x1",
    "result": {
      "number": "0x2710",
      "hash": "0xfa15419fc3de49e2...",
      "parentHash": "0x1ff0db61e7c714a9...",
      "timestamp": "0x693c2fd1"
    }
  }
}
```

### eth\_unsubscribe

Cancels an existing subscription (WebSocket only).

* Input:
  * `String` - Subscription ID
* Output: `Boolean` - `true` if successfully unsubscribed

**Example:**

```json
// Request (WebSocket only)
{
  "jsonrpc": "2.0",
  "method": "eth_unsubscribe",
  "params": ["0x1"],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": true
}
```

***

## Network Methods

### net\_version

Returns the current network ID.

* Input: None
* Output: `String` - Network ID

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "net_version",
  "params": [],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "1672"
}
```

### net\_listening

Returns whether the node is actively listening for network connections.

* Input: None
* Output: `Boolean` - Returns `true` if the node is listening for connections (hardcoded to `true` in current implementation)

> **Note:** This method is not available on the public RPC endpoint.

### net\_peerCount

Returns the number of connected peers.

* Input: None
* Output: `String` - Number of peers as hexadecimal

> **Note:** This method is not available on the public RPC endpoint.

***

## Web3 Methods

### web3\_clientVersion

Returns the current client version.

* Input: None
* Output: `String` - Client version string

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "web3_clientVersion",
  "params": [],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "portal/1.0.0"
}
```

### web3\_sha3

Returns the Keccak-256 hash of the given data.

* Input:
  * `String` - Data to hash (hexadecimal)
* Output: `String` - Keccak-256 hash

> **Note:** This method is not available on the public RPC endpoint.

***

## Debug Methods

### debug\_traceTransaction

Returns the execution trace of a transaction.

* Input:
  * `String` - Transaction hash
  * `Object` - Tracer options (optional). Currently only `"callTracer"` is supported.
* Output: `Object` - Execution trace

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_traceTransaction",
  "params": [
    "0xabc123...",
    {
      "tracer": "callTracer"
    }
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "type": "CALL",
    "from": "0x...",
    "to": "0x...",
    "value": "0x0",
    "gas": "0x...",
    "gasUsed": "0x...",
    "input": "0x...",
    "output": "0x..."
  }
}
```

### debug\_traceCall

Executes a call and returns the execution trace without creating a transaction.

* Input:
  * `Object` - Transaction call object
  * `String` - Block number or tag
  * `Object` - Tracer options (optional). Currently only `"callTracer"` is supported.
* Output: `Object` - Execution trace

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_traceCall",
  "params": [
    {
      "from": "0xfaC0718D882E5f07e1972D617bd430CD72A55D84",
      "to": "0x4100000000000000000000000000000000000000",
      "data": "0x76671808"
    },
    "latest",
    {
      "tracer": "callTracer"
    }
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "failed": false,
    "gas": "0x9d4b",
    "returnValue": {
      "failed": false,
      "gas": "0x9d4b",
      "returnValue": null
    },
    "structLogs": {
      "depth": 1,
      "gas": "0x1c97138",
      "gasCost": "0x3",
      "memSize": 0,
      "op": 96,
      "opName": "PUSH1",
      "pc": 0,
      "refund": 0,
      "stack": []
    }
  }
}
```

### debug\_traceBlockByHash

Returns traces for all transactions in a block by block hash.

* Input:
  * `String` - Block hash
  * `Object` - Tracer options (optional). Currently only `"callTracer"` is supported as the tracer type.
* Output: `Array` - Array of execution traces

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_traceBlockByHash",
  "params": [
    "0x1d13424e6a78ab6d9263e6e5f8c9026588d8ba6d2709127a241fbe53a57fd9d9",
    {
      "tracer": "callTracer"
    }
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "result": {
        "calls": "...",
        "from": "...",
        "gas": "...",
        "gas_used": "...",
        "input": "...",
        "output": "...",
        "to": "...",
        "type": "...",
        "value": "..."
      },
      "txHash": "0xee093bb802e09fe6..."
    }
  ]
}
```

### debug\_traceBlockByNumber

Returns traces for all transactions in a block by block number.

* Input:
  * `String` - Block number or tag
  * `Object` - Tracer options (optional). Currently only `"callTracer"` is supported as the tracer type.
* Output: `Array` - Array of execution traces

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_traceBlockByNumber",
  "params": [
    "0x4ff5de",
    {
      "tracer": "callTracer"
    }
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "result": {
        "calls": "...",
        "from": "...",
        "gas": "...",
        "gas_used": "...",
        "input": "...",
        "output": "...",
        "to": "...",
        "type": "...",
        "value": "..."
      },
      "txHash": "0xee093bb802e09fe6..."
    }
  ]
}
```

### debug\_getRawBlock

Returns the RLP-encoded block data.

* Input:
  * `String` - Block number, block hash, or tag
* Output: `String` - RLP-encoded block data

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_getRawBlock",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0xf90252f9024da01ff0db61e7c714a91d7e3528c7f659e43b1ddfddb8b20848c8..."
}
```

### debug\_getRawHeader

Returns the RLP-encoded block header.

* Input:
  * `String` - Block number, block hash, or tag
* Output: `String` - RLP-encoded header data

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_getRawHeader",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": "0xf9024fa01ff0db61e7c714a91d7e3528c7f659e43b1ddfddb8b20848c87775af..."
}
```

### debug\_getRawReceipts

Returns the raw receipts for a block.

* Input:
  * `String` - Block number, block hash, or tag
* Output: `Array` - Raw receipt data

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_getRawReceipts",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": []
}
```

### debug\_getRawTransaction

Returns the raw transaction data by hash.

* Input:
  * `String` - Transaction hash
* Output: `String` - Raw transaction data

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_getRawTransaction",
  "params": [
    "0xee093bb802e09fe6119e83d7fe35004464a98e69000bcd5672ac73b32172c997"
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0xf9036d668502540b..."
}
```

### debug\_protocolVersion

Returns detailed protocol and version information.

* Input: None
* Output: `Object` - Version information including:
  * `binaryVersion` - Node binary version
  * `currentSpecVersion` - Current spec version
  * `currentStableBlock` - Current stable block number
  * `higherSpecVersions` - Available higher spec versions
  * `protocolVersion` - Protocol version string

> **Note:** This method is not available on the public RPC endpoint.

***

## Trace Methods

### trace\_filter

Returns traces matching a given filter.

* Input:
  * `Object` - Filter parameters:
    * `fromBlock` - Start block (hexadecimal)
    * `toBlock` - End block (hexadecimal)
    * `fromAddress` - Array of sender addresses (optional)
    * `toAddress` - Array of receiver addresses (optional)
    * `count` - Maximum number of traces to return (optional)
    * `after` - Offset for pagination (optional)
* Output: `Array` - Matching traces

> **Note:** Block range is limited to 500 blocks.

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "trace_filter",
  "params": [
    {
      "fromBlock": "0x4ff5de",
      "toBlock": "0x4ff5de"
    }
  ],
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "action": {
        "callType": "...",
        "from": "...",
        "gas": "...",
        "input": "...",
        "to": "...",
        "value": "..."
      },
      "blockHash": "0x1d13424e6a78ab6d...",
      "blockNumber": "0x4ff5de",
      "result": {
        "gas_used": "...",
        "output": "..."
      },
      "subtraces": "0x1",
      "traceAddress": [],
      "transactionHash": "0xee093bb802e09fe6...",
      "transactionPosition": "0x0",
      "type": "CALL"
    }
  ]
}
```

***

## Transaction Pool Methods

### txpool\_nonceFrom

Returns the next nonce for an address from the transaction pool.

* Input:
  * `String` - Address
* Output: `String` - Nonce as hexadecimal

> **Note:** This method is not available on the public RPC endpoint.

***

## Pharos Extension Methods

### eth\_getAccount

Returns account information at a given address (EIP-7587).

* Input:
  * `String` - Address to query
  * `String` - Block number or tag
* Output: `Object` - Account details including balance, nonce, codeHash, and storageRoot

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "eth_getAccount",
  "params": [
    "0xfaC0718D882E5f07e1972D617bd430CD72A55D84",
    "latest"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "balance": "0x425F2B5D87BCB400",
    "codeHash": "0xc5d2460186f7233c...",
    "nonce": "0x2",
    "storageRoot": "0x0000000000000000..."
  }
}
```

### eth\_getProposerByTxHash

Returns the block proposer for a given transaction.

* Input:
  * `String` - Transaction hash
* Output: `Object` - Proposer information

> **Note:** This method is not available on the public RPC endpoint.

### eth\_getProposersByBlockNumber

Returns the list of proposers for a given block.

* Input:
  * `String` - Block number or tag
* Output: `Array` - List of proposer addresses

> **Note:** This method is not available on the public RPC endpoint.

***

## Pharos Debug Extensions

These are Pharos-specific debug methods that extend the standard debug namespace.

### debug\_getValidatorInfo

Returns validator information for the consensus layer.

* Input:
  * `String` - Block number or tag (optional)
* Output: `Object` - Validator details

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_getValidatorInfo",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "blockNumber": "0x2710",
    "validatorSet": [
      {
        "blsKey": "943fd788d6e2d5d7a7520fa92594cd7349169672a4074ea6ad5be564ebd261186c4da4c70a44283f8afc74c1443882a8",
        "identityKey": "04837f833999de7d9ede38c540180e2e7c193cc7a91e40c36355ae348c627687ee8f8274a3462728f46deceaa5f9d76c9224577d87dd975e610749a5d9f367bfab",
        "staking": "0xD3C21BCECCEDA1000000",
        "validatorID": "aa6ddf1a61d8e4dce4b63737de9c188413c489a4b3e080dface9eca672650d62"
      },
      {
        "blsKey": "aa7793ce126340dde2ccaa9c90320e9639006de133629ebf36c21a71a935789def7890446b7181df3e63ba25c8fdffbc",
        "identityKey": "042348d764c8679511b696c15e5f65c3e6e96720a80915def4895c92b7a626e1c9e22aad9e01d4204257feaae538c52ebbd74f0b05897c9d36cf5659f5f91a9b6c",
        "staking": "0xD3C21BCECCEDA1000000",
        "validatorID": "6bdae2537d2ef6508a36b437a28ef7ce7cdfd8581ae81d11f193579896159e62"
      },
      "..."
    ]
  }
}
```

### debug\_getBlockProof

Returns the block proof data for BLS signature verification. See the [BLS Verification Demo](https://github.com/PharosNetwork/examples/blob/main/block-bls-verification/main.go) for usage examples.

* Input:
  * `String` - Block number or tag
* Output: `Object` - Block proof including BLS signatures

**Example:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "debug_getBlockProof",
  "params": [
    "0x2710"
  ],
  "id": 1
}

// Response
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "blockNumber": "0x2710",
    "blockProofHash": "0xfa15419fc3de49e2...",
    "blsAggregatedSignature": "ac312817ac4b5a58695d54da42deedfc581063348a9f2e239e5233684fb43b47d5...",
    "signedBlsKeys": [
      "8281cd60dbf3e67d84a1dcd88f6f95ecf0309ed2c8226eb61d498e3b4453fe309d818f6f02db16b6c610db7b828ef1b5",
      "aa7793ce126340dde2ccaa9c90320e9639006de133629ebf36c21a71a935789def7890446b7181df3e63ba25c8fdffbc",
      "943fd788d6e2d5d7a7520fa92594cd7349169672a4074ea6ad5be564ebd261186c4da4c70a44283f8afc74c1443882a8"
    ]
  }
}
```

### debug\_getBlockReadStates

Returns the read state set for a block.

* Input:
  * `String` - Block number or tag
* Output: `Object` - Read state data

> **Note:** This method is only available on internal debug endpoints.

### debug\_getBlockWriteStates

Returns the write state set for a block.

* Input:
  * `String` - Block number or tag
* Output: `Object` - Write state data

> **Note:** This method is only available on internal debug endpoints.

### debug\_getBlockWriteSetKeys

Returns the write set keys for a block.

* Input:
  * `String` - Block number or tag
* Output: `Array` - Write set keys

> **Note:** This method is only available on internal debug endpoints.

***

## PoW Compatibility Methods (Deprecated)

These methods exist for Ethereum compatibility but return placeholder values since Pharos uses PoS consensus.

| Method                             | Returns | Note                                  |
| ---------------------------------- | ------- | ------------------------------------- |
| eth\_coinbase                      | `"0x0"` | No mining reward address in PoS       |
| eth\_mining                        | `false` | Validators produce blocks, not miners |
| eth\_hashrate                      | `"0x0"` | No hashrate in PoS                    |
| eth\_accounts                      | `[]`    | Node does not manage accounts         |
| eth\_pendingTransactions           | `[]`    | Returns empty array                   |
| eth\_getCompilers                  | `[]`    | Deprecated                            |
| eth\_getUncleCountByBlockHash      | `null`  | Uncles are a PoW concept              |
| eth\_getUncleCountByBlockNumber    | `null`  | Uncles are a PoW concept              |
| eth\_getUncleByBlockHashAndIndex   | `null`  | Uncles are a PoW concept              |
| eth\_getUncleByBlockNumberAndIndex | `null`  | Uncles are a PoW concept              |

***

## Not Implemented Methods

The following methods are declared but not implemented. Calling them returns `METHOD_NOT_FOUND`:

* `eth_batchGetBlockByNumber`
* `eth_batchGetTransactionByHash`
* `eth_batchGetTransactionReceipt`
* `eth_batchGetBlockReceipts`

***

## Notes

* **WebSocket:** `eth_subscribe` and `eth_unsubscribe` require a WebSocket connection. Supported subscription types: `newHeads`, `logs`.
* **Block Tags:** Supported values: `latest`, `earliest`, `pending`, `safe`, `finalized`, or a specific block number in hexadecimal.
* **EIP Support:** EIP-1559 (fee market), EIP-2930 (access lists), EIP-1186 (eth\_getProof) are fully supported.
* **Rate Limiting:** `eth_getLogs` range is limited to 100 blocks (with rate limiting) or 10,000 blocks (fallback). `trace_filter` is limited to 500 blocks.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
