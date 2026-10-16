#!/usr/bin/env node
// wait-receipt.mjs <txhash> — prints receipt JSON, or PENDING, or RPCERR.
const rpc = process.env.ATLANTIC_RPC_URL;
const h = process.argv[2];
try {
  const r = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [h] }),
  }).then((r) => r.json());
  const x = r.result;
  console.log(
    x
      ? JSON.stringify({ status: x.status, blockNumber: x.blockNumber, gasUsed: x.gasUsed, effectiveGasPrice: x.effectiveGasPrice })
      : "PENDING"
  );
} catch {
  console.log("RPCERR");
}
