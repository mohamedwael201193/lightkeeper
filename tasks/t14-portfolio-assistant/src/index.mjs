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
  extractProtocolMention,
  formatUnits,
  cite,
  assertCited,
  summarizeSnapshot,
  decodeWords,
  PROTOCOL_VIEWS,
  DONT_KNOW,
  NO_MARKET_VALUE,
  ATLANTIC_CHAIN_ID,
  ATLANTIC_RPC_URL,
} from "../../../packages/portfolio/src/portfolio.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------- tiny YAML-subset parser (only what sources.yaml uses) ----------
export function parseSourcesYaml(text) {
  const chain = {};
  const assets = [];
  const protocols = [];
  let activity = {};
  let mode = null;
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^chain:/.test(line)) { mode = "chain"; continue; }
    if (/^assets:/.test(line)) { mode = "assets"; continue; }
    if (/^protocols:/.test(line)) { mode = "protocols"; continue; }
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
    if (mode === "protocols") {
      const item = /^-\s*name:\s*(\S+)/.exec(line.trim());
      if (item) {
        cur = { name: item[1] };
        protocols.push(cur);
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
    else if (mode === "protocols" && cur && indent.length >= 4) {
      cur[key] = /^\d+$/.test(val) ? Number(val) : val;
    }
  }
  return { chain, assets, protocols, activity };
}

export function loadRegistry() {
  const text = readFileSync(join(HERE, "..", "sources.yaml"), "utf8");
  return parseSourcesYaml(text);
}

// ---------- protocol / vault / lending positions ----------

/**
 * Read one tracked protocol's position for the wallet, block-pinned.
 * Every number is cited (contract :: view + block). A contract with no code
 * is reported as unknown, never zero. All three registry protocols are
 * LIGHTKEEPER builder-deployed test contracts — disclosed in sources.yaml.
 */
export async function readProtocolPosition(reader, protocol, wallet, blockHex, block) {
  const base = {
    name: protocol.name,
    kind: protocol.kind,
    address: protocol.address,
    deployedBy: protocol.deployedBy,
    verifiedAtBlock: protocol.verifiedAtBlock,
    note: protocol.note,
    block,
  };
  const codeOk = await reader.codePresent(protocol.address);
  if (!codeOk) {
    return {
      ...base,
      unknown: "contract has no code at this address — position unreadable; reported as unknown, not zero",
      source: "eth_getCode",
    };
  }
  const views = PROTOCOL_VIEWS[protocol.kind];
  if (!views) {
    return { ...base, unknown: `no read views defined for protocol kind '${protocol.kind}' — reported as unknown, not zero` };
  }
  const src = (view) => `${protocol.address} :: ${view}(${wallet})`;

  if (protocol.kind === "lending") {
    // MiniLend: positions() -> (collateralWei, debtUsd8dp);
    // getUserAccountData() -> (collateralUsd8dp, debtUsd8dp, hf1e18, price8dp, thresholdBps).
    // Debt is natively USD-denominated ON-CHAIN (8dp) and the price is the
    // contract's own operator-set oracle — both are stored contract values
    // being read, not a market valuation invented by the assistant.
    const [collateralWei] = decodeWords(await reader.viewCall(protocol.address, views.position, [wallet], blockHex));
    const [, debtUsd8, hf1e18, price8, thresholdBps] = decodeWords(
      await reader.viewCall(protocol.address, views.account, [wallet], blockHex));
    const hf = debtUsd8 === 0n
      ? cite({ value: "∞ (debt-free)", raw: hf1e18.toString(), unit: "health factor", source: src(views.account), block })
      : cite({ value: formatUnits(hf1e18, 18), raw: hf1e18.toString(), unit: "health factor (1.0 = 1e18)", source: src(views.account), block });
    return {
      ...base,
      position: {
        collateral: cite({ value: formatUnits(collateralWei, 18), raw: collateralWei.toString(), unit: "PHRS", source: src(views.position), block }),
        debtUsd: cite({ value: formatUnits(debtUsd8, 8), raw: debtUsd8.toString(), unit: "USD, contract-denominated (8dp)", source: src(views.account), block }),
        healthFactor: hf,
        oraclePriceUsd: cite({ value: formatUnits(price8, 8), raw: price8.toString(), unit: "USD/PHRS, contract oracle (8dp)", source: src(views.account), block }),
        liquidationThresholdBps: cite({ value: thresholdBps.toString(), raw: thresholdBps.toString(), unit: "bps", source: src(views.account), block }),
      },
    };
  }

  if (protocol.kind === "staking-vault") {
    const [stakedWei] = decodeWords(await reader.viewCall(protocol.address, views.stake, [wallet], blockHex));
    return {
      ...base,
      position: {
        staked: cite({ value: formatUnits(stakedWei, 18), raw: stakedWei.toString(), unit: "PHRS", source: src(views.stake), block }),
      },
    };
  }

  return { ...base, unknown: `unsupported protocol kind '${protocol.kind}'` };
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
      const meta = await reader.tokenMeta(t, blockHex);
      const raw = await reader.tokenBalance(wallet, t, blockHex);
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

  // Protocol / vault / lending positions — each a live on-chain read at the
  // pinned block, cited with contract AND block, same as token balances.
  const positions = await Promise.all(
    (registry.protocols || []).map((p) => readProtocolPosition(reader, p, wallet, blockHex, block))
  );

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
    balances, txCount, positions, activity,
    activityWindow,
    gasHeadroom, valuation: NO_MARKET_VALUE,
  };
}

/**
 * Answer for a NAMED tracked protocol/vault: the real on-chain position,
 * every number cited (source contract AND pinned block). Builder-deployed
 * test contracts are labeled as such, never as third-party DeFi.
 */
export function positionAnswer(question, snap, protocol, block, chainId) {
  const pos = (snap.positions || []).find((p) => p.name === protocol.name);
  const header =
    `${protocol.name} (${protocol.kind}) position for ${snap.wallet} — ` +
    `builder-deployed test contract (${protocol.deployedBy}), disclosed as such.`;
  const num = (b) => ({ value: b.value, raw: b.raw, unit: b.unit, source: b.source, block: b.block ?? block });

  if (!pos || pos.unknown) {
    const res = {
      intent: "position", question,
      protocol: {
        name: protocol.name, kind: protocol.kind, address: protocol.address,
        unknown: (pos && pos.unknown) || "no position read in this snapshot",
      },
      text:
        header + `\nUNKNOWN — ${((pos && pos.unknown) || "no position read in this snapshot")} ` +
        `[source: ${(pos && pos.source) || "eth_getCode"}, block ${block}]. ` +
        `Reported as unknown, never as zero.`,
      block, chainId,
    };
    return res;
  }

  const lines = [header];
  const out = { name: pos.name, kind: pos.kind, address: pos.address, position: {} };
  if (pos.kind === "lending") {
    const p = pos.position;
    out.position = {
      collateral: num(p.collateral), debtUsd: num(p.debtUsd), healthFactor: num(p.healthFactor),
      oraclePriceUsd: num(p.oraclePriceUsd), liquidationThresholdBps: num(p.liquidationThresholdBps),
    };
    lines.push(
      `• Collateral: ${p.collateral.value} ${p.collateral.unit} [source: ${p.collateral.source}, block ${p.collateral.block}]`,
      `• Debt: ${p.debtUsd.value} ${p.debtUsd.unit} [source: ${p.debtUsd.source}, block ${p.debtUsd.block}]`,
      `• Health factor: ${p.healthFactor.value} (liquidation below 1.0) [source: ${p.healthFactor.source}, block ${p.healthFactor.block}]`,
      `• Oracle price: ${p.oraclePriceUsd.value} ${p.oraclePriceUsd.unit} — the contract's own on-chain oracle, operator-set on testnet, not a market price [source: ${p.oraclePriceUsd.source}, block ${p.oraclePriceUsd.block}]`,
      `• Liquidation threshold: ${p.liquidationThresholdBps.value} ${p.liquidationThresholdBps.unit} [source: ${p.liquidationThresholdBps.source}, block ${p.liquidationThresholdBps.block}]`,
      ``,
      `Note: the USD figures above are the contract's own stored units (debt is natively USD-denominated on-chain; the price is the contract's own oracle). The assistant queries no market price feed and performs no USD valuation of token balances. Valuation: ${NO_MARKET_VALUE}.`
    );
  } else if (pos.kind === "staking-vault") {
    const s = pos.position.staked;
    out.position = { staked: num(s) };
    lines.push(
      `• Staked: ${s.value} ${s.unit} [source: ${s.source}, block ${s.block}]`
    );
    if (s.raw === "0") {
      lines.push(`The operator's stake was fully claimed — the contract reads zero, reported as zero, never hidden.`);
    }
    lines.push(``, `Valuation: ${NO_MARKET_VALUE}.`);
  } else {
    lines.push(`Position kind '${pos.kind}' has no renderer — reported without guessing.`);
  }

  const res = { intent: "position", question, protocol: out, text: lines.join("\n"), block, chainId };
  assertCited(res);
  return res;
}

// ---------- NL answering ----------

function citationsOf(snapshot) {
  return { block: snapshot.block, chainId: snapshot.chainId };
}

export function answer(question, snap, registry) {
  const intent = routeIntent(question);
  const mention = extractTokenMention(question, registry.assets);
  const { block, chainId } = citationsOf(snap);

  // A NAMED tracked protocol/vault gets its real on-chain position —
  // this is the second data class (protocol positions), cited like balances.
  const protoMention = extractProtocolMention(question, registry.protocols);
  if (protoMention) {
    return positionAnswer(question, snap, protoMention, block, chainId);
  }

  // Explicit "I don't know" for protocol-position questions naming nothing tracked.
  if (/\b(vault|lending|stake|staking|pool|protocol|position in)\b/i.test(String(question)) && !mention) {
    const trackedTokens = (registry.assets || []).map((a) => a.symbol).join(", ");
    const trackedProtos = (registry.protocols || []).map((p) => p.name).join(", ");
    return {
      answer:
        DONT_KNOW.untrackedProtocol +
        " Tracked token sources: " + trackedTokens +
        ". Tracked protocols: " + trackedProtos + ".",
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
