# Links — T06 Saga Executor

All links curl-tested 2026-10-16 (HTTP 200, server-rendered HTML with the
identifier present in-page). Atlantic testnet explorer:
`https://atlantic.pharosscan.xyz`.

## Contracts

- TestToken: https://atlantic.pharosscan.xyz/address/0x1F3fb438824140b7E1125502f80B686D95072939
- TestFixture: https://atlantic.pharosscan.xyz/address/0x29bf11Cd948CE845687A21819b2844d5321432Cf

## Deployments

- TestToken deploy: https://atlantic.pharosscan.xyz/tx/0x980d72167fea7733d6da0f372718ac578f2cdd1c92cea951ee82510ab8daca78
- TestFixture deploy: https://atlantic.pharosscan.xyz/tx/0x63e814e827e57b23bc0f4e6951d7b60188256f585db807aee0d463300c0f89c3

## Run A — SUCCEEDED (all 0x1)

- approve: https://atlantic.pharosscan.xyz/tx/0x30183882c8021b6daa017b03d5eecca595bf7faa2128e25eb59ad530e1763a75
- lock: https://atlantic.pharosscan.xyz/tx/0xe46a8c40db9656ecb37baf933f1d6044a0e13a03bfdf7e9e03b022d250256587
- execute: https://atlantic.pharosscan.xyz/tx/0x9c2598384dfdbfd688bbd42e4006308decd455a1940bac95da6d2c529100cd43
- settle: https://atlantic.pharosscan.xyz/tx/0xa13311d24cd0aff5eb91c389f14b22e9be8f9cab7958583d00d7785b09ca5873

## Run B — forced 0x0 → COMPENSATED

- approve: https://atlantic.pharosscan.xyz/tx/0x452acae1ec4335ecd0842672c97383b5671e1ad950150224f307dcd17a928ba7
- lock: https://atlantic.pharosscan.xyz/tx/0x0371814a1739f58698722db4915da1b718512c9bafcb347da3def4a6576f0eea
- **execute (REAL 0x0)**: https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05
- compensate refund: https://atlantic.pharosscan.xyz/tx/0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca
- compensate revoke: https://atlantic.pharosscan.xyz/tx/0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b

## Repo

- Module dir (commit-pinned at submission time — see SUBMISSION.md):
  `https://github.com/mohamedwael201193/lightkeeper/tree/32951cf4f0b9105046aef5bd5dcd4d5f3f85b531/tasks/t06-saga-executor`
