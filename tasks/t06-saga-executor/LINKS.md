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

## Run C — mid-step crash → resume → SUCCEEDED (idempotency proof)

- run-c approve (broadcast BEFORE the crash, receipt re-read at resume — never re-broadcast): https://atlantic.pharosscan.xyz/tx/0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14 (block 31486478, 0x1)
- run-c lock: https://atlantic.pharosscan.xyz/tx/0x609b2b06be22646c82d7b6bcacbac8170a38edbd0e9d53ff3675832e4c8bf0b6 (block 31486635, 0x1)
- run-c execute: https://atlantic.pharosscan.xyz/tx/0xd9e4fb6dc7c8d998ec0c532cb73211bd2ab927f04881f55ab0273db9c4e5cc62 (block 31486759, 0x1)
- run-c settle: https://atlantic.pharosscan.xyz/tx/0x9a93fe34fae224cf9ca3e229b3d90a52c94eeeb8379cc09c7f8cb2918f97ea75 (block 31486778, 0x1)

State log + plan: `runs/t06-run-c-20261016-063734/{state.log,plan.json,run.json}`.

## Auditor re-verification runs (2026-10-22, independent re-runs)

- auditor run-a approve: https://atlantic.pharosscan.xyz/tx/0x4c6b6ee189edad8b4679827de0b52f882669fa714fb6cbeaf2a21fac273b2776 (block 31749790, 0x1)
- auditor run-a lock: https://atlantic.pharosscan.xyz/tx/0xcc03284a3aad72e920bf2d85edcef569b8899b4ad23b22a6ad77cdc5139260d7 (block 31749835, 0x1)
- auditor run-a execute: https://atlantic.pharosscan.xyz/tx/0xc67f292a001c53b429f3f7935009d4d9b72c889df7c464e89dc95568abb49817 (block 31749854, 0x1)
- auditor run-a settle: https://atlantic.pharosscan.xyz/tx/0x1afeaaa39ba47e26e8d4ea07776ab9da781d4aad64de5304e873ce01554b2882 (block 31749863, 0x1)
- → SUCCEEDED after a mid-step crash + resume (`runs/t06-run-a-20261022-170455/state.log`)
- auditor run-b approve: https://atlantic.pharosscan.xyz/tx/0xcf47059ef16f324c54cabd62b9992c652ed7edac196c931fa6a3e049ffa4f962 (block 31749881, 0x1)
- auditor run-b lock: https://atlantic.pharosscan.xyz/tx/0x507798e0f5b06726a664411667e4a4bbd0c0869f32d63a377b8ebddf4eba3e9d (block 31749894, 0x1)
- auditor run-b **execute (REAL 0x0)**: https://atlantic.pharosscan.xyz/tx/0xb6ea8b369730062051cc1434c694e30ae966725b4b19b8c89f19c2f2c2caf1a8 (block 31749906, 0x0)
- auditor run-b compensate refund: https://atlantic.pharosscan.xyz/tx/0xd5d9edf045334a3e766c347b0e053e7ed35ee69693b2754c8346f1c97e1c6232 (block 31749917, 0x1)
- auditor run-b compensate revoke: https://atlantic.pharosscan.xyz/tx/0xb9d28c4a9115152c97b56d39ad212b6771af1c88589c05bfcd35be45249fbcfe (block 31749931, 0x1)
- → COMPENSATED (`runs/t06-run-b-20261022-170705/state.log`)

## Repo

- Module dir (tree/bd2b759ee66c8240778d6a7052d914c99759ba6f — re-pin at the fix commit; was 32951cf4f0b9105046aef5bd5dcd4d5f3f85b531 at submission time, see SUBMISSION.md):
  `tree/bd2b759ee66c8240778d6a7052d914c99759ba6f/tasks/t06-saga-executor`
