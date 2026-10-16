/**
 * t09-trend-watcher — pure trend-detection math.
 *
 * Zero dependencies. All money values are BigInt (wei). No floats anywhere.
 *
 * Rule (explicit parameters, from config.yaml):
 *   - fastMA = mean of last `fastWindow` samples
 *   - slowMA = mean of last `slowWindow` samples
 *   - a sample is "above threshold" iff fastMA > slowMA * (1 + bandBps/10000)
 *   - FIRE iff `confirmations` CONSECUTIVE samples are above threshold
 *   - any sample NOT above threshold RESETS the streak to 0 (anti-spike)
 *   - after a FIRE, no new FIRE within `cooldownBlocks` blocks
 *   - failed observations (observer error) are fail-closed: HOLD, streak untouched
 */

/**
 * Integer moving average of the last `window` values.
 * @param {bigint[]} values
 * @param {number} window
 * @returns {bigint | null} null when fewer than `window` values exist (warmup)
 */
export function movingAverage(values, window) {
  if (!Array.isArray(values) || values.length < window || window < 1) return null;
  let sum = 0n;
  for (let i = values.length - window; i < values.length; i++) sum += values[i];
  return sum / BigInt(window);
}

/**
 * Classify the trend between two moving averages with a deadband.
 * BULLISH iff fastMA > slowMA * (10000 + bandBps) / 10000.
 * BEARISH iff fastMA * (10000 + bandBps) / 10000 < slowMA... (mirror, integer-safe):
 *   fastMA < slowMA  AND  slowMA * 10000 > fastMA * (10000 + bandBps)
 * otherwise FLAT (inside the band).
 */
export function classifyTrend(fastMA, slowMA, bandBps) {
  const SCALE = 10000n;
  const band = BigInt(bandBps);
  if (fastMA * SCALE > slowMA * (SCALE + band)) return "BULLISH";
  if (slowMA * SCALE > fastMA * (SCALE + band)) return "BEARISH";
  return "FLAT";
}

/**
 * Evaluate one new sample against running streak state.
 *
 * Dual condition (both required for a confirmation):
 *   1. trend  = BULLISH crossover: fastMA > slowMA * (1 + band)
 *   2. reading above threshold:  the RAW sample value > slowMA * (1 + band)
 * Condition (2) measures the PRESENT reading, so a single spike cannot
 * echo through the fast-MA window into false confirmations.
 *
 * @param {{streak:number, lastFireBlock:number|null}} priors
 * @param {bigint|null} fastMA null => warmup
 * @param {bigint|null} slowMA null => warmup
 * @param {bigint} rawValue the current sample's raw reading (wei)
 * @param {number} blockNumber
 * @param {number} confirmations
 * @param {number} bandBps
 * @param {number} cooldownBlocks
 * @returns {{decision:"FIRE"|"HOLD", reason:string, streak:number, lastFireBlock:number|null, above:boolean}}
 */
export function decide(priors, fastMA, slowMA, rawValue, blockNumber, confirmations, bandBps, cooldownBlocks) {
  if (fastMA === null || slowMA === null) {
    return { decision: "HOLD", reason: "WARMUP_INSUFFICIENT_SAMPLES", streak: 0, lastFireBlock: priors.lastFireBlock, above: false };
  }
  const SCALE = 10000n;
  const band = BigInt(bandBps);
  const trend = classifyTrend(fastMA, slowMA, bandBps);
  const readingAbove = rawValue * SCALE > slowMA * (SCALE + band);
  const above = trend === "BULLISH" && readingAbove;
  let streak = above ? priors.streak + 1 : 0; // streak RESETS on any non-confirming sample (anti-spike)
  let decision = "HOLD";
  let reason;
  if (trend === "BEARISH") reason = "BEARISH_TREND_STREAK_RESET";
  else if (trend === "BULLISH" && !readingAbove) reason = "READING_BELOW_BAND_STREAK_RESET";
  else if (trend === "FLAT") reason = "FLAT_INSIDE_BAND_STREAK_RESET";
  else reason = `STREAK_${streak}_OF_${confirmations}`;

  let lastFireBlock = priors.lastFireBlock;
  if (above && streak >= confirmations) {
    const cooledDown = lastFireBlock === null || blockNumber - lastFireBlock >= cooldownBlocks;
    if (cooledDown) {
      decision = "FIRE";
      reason = `CONFIRMED_${confirmations}X_ABOVE_BAND`;
      lastFireBlock = blockNumber;
      streak = 0; // require a fresh confirmation run after firing
    } else {
      reason = `CONFIRMED_BUT_COOLDOWN_${cooldownBlocks - (blockNumber - lastFireBlock)}_BLOCKS_LEFT`;
      streak = 0;
    }
  }
  return { decision, reason, streak, lastFireBlock, above };
}

/**
 * Run the full evaluation over an ordered sample series.
 *
 * @param {{blockNumber:number, value:bigint, ts?:number, error?:string}[]} samples
 * @param {{fastWindow:number, slowWindow:number, bandBps:number, confirmations:number, cooldownBlocks:number}} params
 * @param {{streak:number, lastFireBlock:number|null}} priors initial priors (loaded from runtime.json)
 * @returns {{rows: object[], endPriors: object}} rows carry per-sample math + decision
 */
export function evaluateSeries(samples, params, priors) {
  const values = [];
  let state = { streak: priors.streak ?? 0, lastFireBlock: priors.lastFireBlock ?? null };
  const rows = [];

  for (const s of samples) {
    if (s.error) {
      // fail-closed: record the error, HOLD, streak untouched
      rows.push({
        blockNumber: s.blockNumber, ts: s.ts ?? null, valueWei: null,
        fastMAWei: null, slowMAWei: null, trend: "ERROR", above: false,
        streak: state.streak, decision: "HOLD",
        reason: `OBSERVER_ERROR_${s.error}`,
      });
      continue;
    }
    values.push(s.value);
    const fastMA = movingAverage(values, params.fastWindow);
    const slowMA = movingAverage(values, params.slowWindow);
    const d = decide(state, fastMA, slowMA, s.value, s.blockNumber,
      params.confirmations, params.bandBps, params.cooldownBlocks);
    state = { streak: d.streak, lastFireBlock: d.lastFireBlock };
    rows.push({
      blockNumber: s.blockNumber, ts: s.ts ?? null,
      valueWei: s.value.toString(),
      fastMAWei: fastMA === null ? null : fastMA.toString(),
      slowMAWei: slowMA === null ? null : slowMA.toString(),
      trend: fastMA === null || slowMA === null ? "WARMUP" : classifyTrend(fastMA, slowMA, params.bandBps),
      above: d.above, streak: d.streak, decision: d.decision, reason: d.reason,
    });
  }
  return { rows, endPriors: state };
}
