# @lightkeeper/value-format (L4)

Human formatting for amounts/addresses (TypeScript). Rules, enforced in
code: amounts are bigint-only — decimal strings parse exactly via
`parseDecimalToBigint`, never through float; decimals are a parameter, never
assumed; every formatted amount keeps its raw form alongside
(`FormattedAmount.raw`); no naked numbers.

## API (`src/index.ts`)

- `parseDecimalToBigint(value: string, decimals: number): bigint`
- `formatAmount(raw: bigint | string, decimals: number, symbol?: string): FormattedAmount`
- `isAddress(s: string): boolean`, `shortAddress(addr: string): string`

## Consumers (real runtime import)

- `apps/console/src/hooks/useAtlantic.ts` — `phrsToWeiHex` / `isDustWarning` use `parseDecimalToBigint` (hook keeps its own UX error messages; exports unchanged)

## Test

```bash
cd apps/console && npx tsc ../../packages/value-format/src/index.ts \
  --outDir ../../packages/value-format/dist-test --module nodenext \
  --target es2020 --moduleResolution nodenext --skipLibCheck
node ../../packages/value-format/tests/test_value_format.mjs
```
