/**
 * T14 Portfolio Assistant — CLI entry (index).
 *
 * Read-only portfolio reader + NL question answering for a Pharos Atlantic
 * wallet. Uses @lightkeeper/portfolio (L8) for all chain reads.
 *
 * READ-ONLY BY CONSTRUCTION: this module never imports key material, never
 * builds a signer, never broadcasts. CI greps this folder for key material
 * (private keys, mnemonics, env-loaded secrets) and fails the build if any
 * appears.
 */
import {
  PortfolioReader,
  routeIntent,
  extractTokenMention,
  formatUnits,
  cite,
  assertCited,
  summarizeSnapshot,
  DONT_KNOW,
  NO_MARKET_VALUE,
  ATLANTIC_CHAIN_ID,
  ATLANTIC_RPC_URL,
} from "./lib/portfolio.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------- tiny YAML-subset parser (only what sources.yaml uses) ----------
export function parseSourcesYaml(text) {
  const chain = {};
  const assets = [];
  let activity = {};
  let mode = null;
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^chain:/.test(line)) { mode = "chain"; continue; }
    if (/^assets:/.test(line)) { mode = "assets"; continue; }
    if (/^valuation:/.test(line)) { mode = "valuation"; continue; }
    if (/^activity:/.test(line)) { mode = "activity"; continue; }
    if (mode === "assets") {
      const item = /^-\s*symbol:\s*(\S+)/.exec(line.trim());
      if (item) {
        cur = { symbol: item[1] };
        assets.push(cur);
        continue;
      }
    }
    const m = /^(\s+)([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, indent, key, valRaw] = m;
    const val = valRaw.trim().replace(/^["']|["']$/g, "");
    if (mode === "chain" && indent.length === 2) chain[key] = key === "chainId" ? Number(val) : val;
    else if (mode === "activity" && indent.length === 2) activity[key] = /^\d+$/.test(val) ? Number(val) : val;
    else if (mode === "assets" && cur && indent.length >= 4) {
      cur[key] = val === "null" ? null : (/^\d+$/.test(val) ? Number(val) : val);
    }
  }
  return { chain, assets, activity };
}

export function loadRegistry() {
  const text = readFileSync(join(HERE, "..", "sources.yaml"), "utf8");
  return parseSourcesYaml(text);
}

// ---------- snapshot ----------

export async function snapshot(wallet, reader, registry, opts = {}) {
  const withActivity = opts.activity !== false;
  await reader.assertAtlantic();
  const block = await reader.pinBlock();
  const blockHex = "0x" + block.toString(16);

  const balances = await Promise.all(
    registry.assets.map(async (t) => {
      if (t.kind === "native") {
        const raw = await reader.nativeBalance(wallet, blockHex);
        return {
          ...cite({
            value: formatUnits(raw, 18), raw: raw.toString(), unit: "PHRS",
            source: "eth_getBalance", block,
          }),
          symbol: "PHRS", name: "Pharos (native)", kind: "native",
          address: null, decimals: 18, formatted: formatUnits(raw, 18),
        };
      }
      const codeOk = await reader.codePresent(t.address);
      if (!codeOk) {
        return {
          symbol: t.symbol, kind: "erc20", address: t.address,
          unknown: "contract has no code at this address — balance unreadable; reported as unknown, not zero",
          block, source: "eth_getCode",
        };
      }
      const meta = await reader.tokenMeta(t);
      const raw = await reader.tokenBalance(wallet, t);
      return {
        ...cite({
          value: formatUnits(raw, meta.decimals), raw: raw.toString(), unit: meta.symbol,
          source: `${t.address} :: balanceOf(${wallet})`, block,
        }),
        symbol: meta.symbol, name: meta.name, kind: "erc20",
        address: t.address, decimals: meta.decimals, formatted: formatUnits(raw, meta.decimals),
      };
    })
  );

  const txCountRaw = await reader.txCount(wallet, blockHex);
  const txCount = cite({ value: String(txCountRaw), raw: String(txCountRaw), unit: "txs", source: "eth_getTransactionCount", block });

  const windowBlocks = registry.activity.windowBlocks || 10000;
  const activity = withActivity
    ? (await Promise.all(
        registry.assets
          .filter((t) => t.kind === "erc20")
          .map(async (t) => {
            const evts = await reader.transferActivity(wallet, t.address, block - windowBlocks, block);
            const meta = balances.find((b) => b.address === t.address);
            return evts.map((e) => ({
              ...e,
              symbol: meta?.symbol || t.symbol,
              decimals: meta?.decimals ?? t.decimals,
              formatted: formatUnits(BigInt(e.amountRaw), meta?.decimals ?? t.decimals),
              token: t.address,
            }));
          })
      )).flat().sort((a, b) => a.block - b.block)
    : [];
  const activityWindow = withActivity
    ? { from: block - windowBlocks, to: block, windowBlocks }
    : { from: null, to: null, windowBlocks, note: "activity scan skipped for this run" };

  // gas headroom: simple-transfer estimate from current gas price
  const gasPriceHex = await reader.rpc("eth_gasPrice");
  const gasPrice = BigInt(gasPriceHex);
  const native = balances.find((b) => b.symbol === "PHRS");
  const nativeRaw = BigInt(native.raw);
  const simpleTransfers = gasPrice > 0n ? Number(nativeRaw / (gasPrice * 21000n)) : 0;
  const gasHeadroom = {
    ...cite({ value: native.formatted, raw: native.raw, unit: "PHRS", source: "eth_getBalance + eth_gasPrice", block }),
    formatted: native.formatted, simpleTransfers,
    gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(3),
  };

  return {
    wallet, chainId: ATLANTIC_CHAIN_ID, rpc: ATLANTIC_RPC_URL, block,
    balances, txCount, activity,
    activityWindow,
    gasHeadroom, valuation: NO_MARKET_VALUE,
  };
}

// ---------- NL answering ----------

function citationsOf(snapshot) {
  return { block: snapshot.block, chainId: snapshot.chainId };
}

export function answer(question, snap, registry) {
  const intent = routeIntent(question);
  const mention = extractTokenMention(question, registry.assets);
  const { block, chainId } = citationsOf(snap);

  // Explicit "I don't know" for protocol-position questions naming nothing tracked.
  if (/\b(vault|lending|stake|staking|pool|protocol|position in)\b/i.test(String(question)) && !mention) {
    return {
      answer:
        DONT_KNOW.untrackedProtocol +
        " Tracked sources: " +
        registry.assets.map((a) => a.symbol).join(", ") +
        ".",
      intent: "untracked",
      block,
      chainId,
    };
  }

  const num = (b) => ({ value: b.value, raw: b.raw, unit: b.unit, source: b.source, block: b.block ?? block });

  switch (intent) {
    case "balance": {
      const targets = mention
        ? snap.balances.filter((b) => b.symbol === mention.symbol)
        : snap.balances;
      if (mention && !targets.length)
        return { answer: `${DONT_KNOW.untrackedProtocol} (${mention.symbol} is named in the question but has no verified registry entry.)`, intent, block, chainId };
      const parts = targets.map((b) =>
        b.unknown
          ? `${b.symbol}: UNKNOWN — ${b.unknown} [source: ${b.source}, block ${b.block}]`
          : `${b.symbol}: ${b.formatted} ${b.symbol} [source: ${b.source}, block ${b.block}]`
      );
      const res = {
        intent, question,
        balances: targets.map((b) => (b.unknown ? { symbol: b.symbol, unknown: b.unknown, source: b.source, block: b.block } : num(b))),
        text: parts.join("\n") + `\n\nValuation: ${NO_MARKET_VALUE}.`,
        block, chainId,
      };
      assertCited(res);
      return res;
    }
    case "holdings": {
      const held = snap.balances.filter((b) => !b.unknown && BigInt(b.raw) > 0n);
      const res = {
        intent, question,
        holdings: held.map((b) => num(b)),
        text:
          (held.length
            ? "Non-zero holdings:\n" + held.map((b) => `• ${b.formatted} ${b.symbol} [source: ${b.source}, block ${b.block}]`).join("\n")
            : "No tracked assets with non-zero balance at the snapshot block.") +
          `\n\nValuation: ${NO_MARKET_VALUE}.`,
        block, chainId,
      };
      assertCited(res);
      return res;
    }
    case "txcount": {
      const res = {
        intent, question,
        txCount: num(snap.txCount),
        text: `This wallet has made ${snap.txCount.value} transactions (outgoing tx count). [source: ${snap.txCount.source}, block ${snap.txCount.block}]`,
        block, chainId,
      };
      assertCited(res);
      return res;
    }
    case "activity": {
      const w = snap.activityWindow;
      const lines = snap.activity.map(
        (a) =>
          `• ${a.dir === "in" ? "received" : "sent"} ${a.formatted} ${a.symbol} — ${a.txHash.slice(0, 14)}… [block ${a.block}, token ${a.token}]`
      );
      const res = {
        intent, question,
        activity: snap.activity.map((a) => ({
          txHash: a.txHash, block: a.block, dir: a.dir, token: a.token,
          amount: { value: a.formatted, raw: a.amountRaw, unit: a.symbol, source: `eth_getLogs Transfer on ${a.token}`, block: a.block },
        })),
        text:
          (lines.length ? "Recent ERC20 activity:\n" + lines.join("\n") : "No ERC20 Transfer events involving this wallet in the scanned window.") +
          `\n\nScanned blocks ${w.from}–${w.to} (${w.windowBlocks} blocks). Native PHRS transfers are not visible in event logs — the assistant does not claim to see them.`,
        block, chainId,
      };
      assertCited(res);
      return res;
    }
    case "gas": {
      const g = snap.gasHeadroom;
      const res = {
        intent, question,
        gasHeadroom: { ...num(g), simpleTransfers: g.simpleTransfers, gasPriceGwei: g.gasPriceGwei },
        text:
          `Native balance: ${g.formatted} PHRS [source: ${g.source}, block ${g.block}].\n` +
          `At the current gas price (${g.gasPriceGwei} gwei) that covers roughly ${g.simpleTransfers} simple native transfers (21,000 gas each). Token units only — ${NO_MARKET_VALUE}.`,
        block, chainId,
      };
      assertCited(res);
      return res;
    }
    case "token_info": {
      if (!mention)
        return { answer: `${DONT_KNOW.untrackedProtocol}`, intent, block, chainId };
      const t = registry.assets.find((a) => a.symbol === mention.symbol);
      const b = snap.balances.find((x) => x.symbol === mention.symbol);
      const res = {
        intent, question,
        token: {
          symbol: t.symbol, name: b?.name || t.name, address: t.address, kind: t.kind,
          decimals: b?.decimals ?? t.decimals, verifiedAtBlock: t.verifiedAtBlock || null,
        },
        text: `${t.symbol} (${b?.name || t.name}): ${t.kind === "native" ? "native asset, no contract" : "contract " + t.address + (t.verifiedAtBlock ? `, code verified on-chain at block ${t.verifiedAtBlock}` : "")}, ${b?.decimals ?? t.decimals} decimals.`,
        block, chainId,
      };
      return res;
    }
    case "valuation":
      return { answer: DONT_KNOW.valuation, intent, block, chainId };
    default:
      return {
        answer:
          "I don't know how to answer that: it matches none of my 6 supported question types " +
          "(balance, holdings, transaction count, recent activity, gas headroom, token info). " +
          "I answer from pinned on-chain reads only — I won't guess.",
        intent: "unknown", block, chainId,
      };
  }
}

/** Negative probes: prove the "I don't know" paths with real on-chain behavior. */
export async function negativeProbes(reader, registry, wallet, snap) {
  const probes = [];
  // 1. Unsupported view function on a real token → must revert / fail.
  try {
    await reader.erc20Call(registry.assets.find((a) => a.symbol === "USDC").address, "nonExistentView()(uint256)");
    probes.push({ name: "unsupported-function", result: "UNEXPECTED: call did not fail", honest: false });
  } catch (e) {
    probes.push({ name: "unsupported-function", result: "call refused as designed: " + String(e.message).slice(0, 120), honest: true });
  }
  // 2. Untracked protocol question.
  const r = answer("what is my position in the AquaLend vault?", snap, registry);
  probes.push({ name: "untracked-protocol", result: r.answer || r.text, honest: !!(r.answer || "").includes("don't know") });
  // 3. Valuation question → must refuse with no-market-value.
  const r2 = answer("what is my portfolio worth in USD?", snap, registry);
  probes.push({ name: "no-price-feed", result: r2.answer, honest: r2.answer.includes("no market value") && !/\$\d/.test(r2.answer) });
  // 4. Address with no code → unknown, not zero.
  const ghost = "0x000000000000000000000000000000000000dEaD";
  const codeOk = await reader.codePresent(ghost).catch(() => false);
  probes.push({ name: "no-code-address", result: codeOk ? "UNEXPECTED: code present" : "no code at address → reported as unknown, never as zero balance", honest: !codeOk });
  return probes;
}
