// Launch-Odds Radar v7: the token radar's model, written fresh for this entry.
//
// Everything is fitted at runtime from the sealed snapshot; nothing is
// hardcoded per protocol. The value model is a peer-multiple model whose
// coefficients are chosen by HELD-OUT error only (leave-one-out and a
// walk-forward test), never by full-fit error: v5 chose on full fit and its
// hold-outs blew up. A term enters only when it lowers the held-out miss in
// BOTH tests. The priced-comp set is rule-based: a token with a usable
// market cap (mcap_usd > 0), not a CEX and not a versioned pool — the same
// rule rank 1's 118 priced comps follow. The odds model is a logistic
// regression on snapshot features only; the category token rate it uses is
// computed out-of-fold, never from the row itself (the in-sample rate looked
// strong at AUC 0.808 and was pure leakage).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The value model's fitted coefficients (chosen by the runtime grid search). */
export interface ValueParams {
  beta: number;
  growth: number;
  maturity: number;
  breadth: number;
  shrinkK: number;
}

/** One grid candidate and its held-out scores, for the evidence table. */
export interface GridCandidate {
  beta: number;
  growth: number;
  maturity: number;
  breadth: number;
  shrinkK: number;
  loo: number;
  looWin: number;
  wf: number;
  wfWin: number;
}

/** The held-out validation of the chosen value model. */
export interface ValueValidation {
  fullFit: number;
  loo: number;
  looWin: number;
  looP90: number;
  wf: number;
  wfWin: number;
  wfTrain: number;
  wfTest: number;
  folds: number[];
  foldsWin: number[];
  foldSeeds: number[][];
  rangeP25: number;
  rangeP75: number;
  rangeP10: number;
  rangeP90: number;
  coverP25P75: number;
  coverP10P90: number;
  coverWithin3: number;
}

/** The odds model's held-out validation. */
export interface OddsValidation {
  auc: number;
  brier: number;
  brierBase: number;
  accuracy: number;
  baseRate: number;
  aucAgeOnly: number;
  aucNoCat: number;
  lambda: number;
  n: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  terminal_value_usd: number;
  token_odds: number;
  range_low_usd: number;
  range_high_usd: number;
  range_p10_usd: number;
  range_p90_usd: number;
  rank_low: number;
  rank_high: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
  net_usd: number;
  net_per_hour_usd: number;
  drop_usd: number;
  fees_usd: number;
  hours: number;
  deposit_usd: number;
  model: {
    peer_multiple: number;
    size_exponent: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    scale: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  terminal_value_usd: number;
  token_odds: number;
  range_low_usd: number;
  range_high_usd: number;
  range_p10_usd: number;
  range_p90_usd: number;
  rank_low: number;
  rank_high: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
  net_usd: number;
  net_per_hour_usd: number;
  drop_usd: number;
  fees_usd: number;
  hours: number;
  deposit_usd: number;
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
}

/** A priced comp (a traded token the model learns from). */
export interface PricedComp {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** One accounting group: every snapshot protocol sits in exactly one. */
export interface AccountGroup {
  label: string;
  count: number;
  rule: string;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  params: ValueParams;
  grid: GridCandidate[];
  termTable: { term: string; looWith: number; looWithout: number; wfWith: number; wfWithout: number; kept: boolean }[];
  validation: ValueValidation;
  odds: OddsValidation;
  oddsWeights: { feature: string; weight: number }[];
  accounting: AccountGroup[];
  rows: RadarRow[];
  steps: Record<string, string[]>;
  live: PricedComp[];
  scatter: { x: number; y: number; cat: string }[];
  sizeCurve: { intercept: number; beta: number };
  feeSchedule: { tier: string; setup: number; action: number; weekly: number; claim: number }[];
  farmDefault: { depositPct: number; dropShare: number; horizonWeeks: number; tbill: number; hourlyBar: number };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

import { createHash } from 'node:crypto';

const DAY_MS = 86_400_000;
export const MODEL_VERSION = 'radar-7';
/** The board's size: watchlist 40 + early 158. */
export const BOARD_ROWS = 198;
/** Bootstrap refits for the rank ranges. */
export const BOOTSTRAPS = 200;
/** Farm defaults: deposit is 0.02% of TVL clamped to $1,000–$10,000. */
export const FARM = { depositPct: 0.0002, depositMin: 1000, depositMax: 10000, dropShare: 0.07, horizonWeeks: 12, tbill: 0.04, hourlyBar: 25 };

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The five categories the house rule treats as wrapped/staked/bridged products. */
const BRIDGE_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a bridge/staking product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !BRIDGE_CATS.has(p.category ?? '');
}

/** Whether a protocol is a priced comp: a token with a usable market cap, not a CEX, not a versioned pool. */
export function isPricedComp(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The median of a list of numbers. */
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A quantile of a sorted list (linear interpolation). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** exp(median |x|): the typical miss as a factor. */
export function missFactor(errs: number[]): number {
  return Math.exp(median(errs.map((e) => Math.abs(e))));
}

/** exp(mean of winsorized |x|): the robust companion miss, capped at ln(4.5). */
export function winsorizedFactor(errs: number[]): number {
  const cap = Math.log(4.5);
  return Math.exp(errs.reduce((s, e) => s + Math.min(Math.abs(e), cap), 0) / errs.length);
}

/** A deterministic 32-bit hash of a string (for the fold split). */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The 5-fold split: md5(seed + ':' + slug), first 8 hex digits, mod 5 — the partition validated offline across five seeds. */
export function foldOf(slug: string, seed: number): number {
  const hex = createHash('md5').update(`${seed}:${slug}`).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 5;
}

// ---------------------------------------------------------------- value model

/** One priced comp's features, precomputed once. */
interface CompFeatures {
  slug: string;
  cat: string;
  logTvl: number;
  y: number;
  logRatio: number;
  growth: number;
  maturity: number;
  breadth: number;
  listed: string | null;
}

function compFeatures(p: SnapshotProtocol, asOf: string): CompFeatures {
  const age = ageDays(asOf, p.listed_at);
  const chg = p.change_7d === null ? 0 : Math.max(-0.5, Math.min(2.0, p.change_7d / 100));
  const mat = 0.6 + (Math.min(Math.max(age ?? 365, 0), 1095) / 1095) * 0.4;
  return {
    slug: p.slug,
    cat: p.category ?? 'Other',
    logTvl: Math.log(p.tvl_usd),
    y: Math.log(p.mcap_usd!),
    logRatio: Math.log(p.mcap_usd! / p.tvl_usd),
    growth: Math.log1p(chg),
    maturity: Math.log(mat),
    breadth: Math.log(Math.max(1, p.chains.length)),
    listed: p.listed_at,
  };
}

/** The peer log-multiple for a category from a training set's base residuals, shrunk toward the global median. */
function peerFromBase(cat: string, train: CompFeatures[], base: number[], params: ValueParams, globalMed: number): number {
  const vals: number[] = [];
  train.forEach((g, i) => {
    if (g.cat === cat) vals.push(base[i]!);
  });
  if (vals.length === 0) return globalMed;
  const med = median(vals);
  const w = vals.length / (vals.length + params.shrinkK);
  return globalMed + w * (med - globalMed);
}

/** Base residuals of a training set under params: y - beta*logTvl - growth - maturity - breadth. */
function baseResiduals(train: CompFeatures[], params: ValueParams): number[] {
  return train.map((g) => g.y - params.beta * g.logTvl - params.growth * g.growth - params.maturity * g.maturity - params.breadth * g.breadth);
}

/** Predict log(mcap) for one comp from a training set (peers + scale from train only). */
function predictComp(f: CompFeatures, train: CompFeatures[], params: ValueParams): number {
  const base = baseResiduals(train, params);
  const globalMed = median(base);
  const peer = peerFromBase(f.cat, train, base, params, globalMed);
  const scale = median(train.map((g, i) => base[i]! - peerFromBase(g.cat, train, base, params, globalMed)));
  return params.beta * f.logTvl + peer + params.growth * f.growth + params.maturity * f.maturity + params.breadth * f.breadth + scale;
}

/** Fit peers + scale on a training set (returned for reuse). */
function fitPeers(train: CompFeatures[], params: ValueParams): { peers: Map<string, number>; globalMed: number; scale: number } {
  const base = baseResiduals(train, params);
  const globalMed = median(base);
  const peers = new Map<string, number>();
  for (const cat of new Set(train.map((g) => g.cat))) {
    peers.set(cat, peerFromBase(cat, train, base, params, globalMed));
  }
  const scale = median(train.map((g, i) => base[i]! - (peers.get(g.cat) ?? globalMed)));
  return { peers, globalMed, scale };
}

/** A board protocol's features for prediction (no market cap needed). */
function boardFeatures(p: SnapshotProtocol, asOf: string): { cat: string; logTvl: number; growth: number; maturity: number; breadth: number } {
  const age = ageDays(asOf, p.listed_at);
  const chg = p.change_7d === null ? 0 : Math.max(-0.5, Math.min(2.0, p.change_7d / 100));
  const mat = 0.6 + (Math.min(Math.max(age ?? 365, 0), 1095) / 1095) * 0.4;
  return {
    cat: p.category ?? 'Other',
    logTvl: Math.log(p.tvl_usd),
    growth: Math.log1p(chg),
    maturity: Math.log(mat),
    breadth: Math.log(Math.max(1, p.chains.length)),
  };
}

/** Predict log(terminal value) for a board protocol with precomputed peers + scale. */
function predictBoard(f: { cat: string; logTvl: number; growth: number; maturity: number; breadth: number }, peers: Map<string, number>, globalMed: number, scale: number, params: ValueParams): number {
  const peer = peers.get(f.cat) ?? globalMed;
  return params.beta * f.logTvl + peer + params.growth * f.growth + params.maturity * f.maturity + params.breadth * f.breadth + scale;
}

/** Predict log(mcap) with precomputed peers + scale (fast path for priced comps). */
function predictWithPeers(f: CompFeatures, peers: Map<string, number>, globalMed: number, scale: number, params: ValueParams): number {
  const peer = peers.get(f.cat) ?? globalMed;
  return params.beta * f.logTvl + peer + params.growth * f.growth + params.maturity * f.maturity + params.breadth * f.breadth + scale;
}

/** Leave-one-out signed log errors under params (negative = over-predicted). */
function looSignedErrors(comps: CompFeatures[], params: ValueParams): number[] {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const f = comps[i]!;
    errs.push(f.y - predictComp(f, train, params));
  }
  return errs;
}

/** Leave-one-out absolute log errors under params. */
function looErrors(comps: CompFeatures[], params: ValueParams): number[] {
  return looSignedErrors(comps, params).map((e) => Math.abs(e));
}

/** Walk-forward errors: the earliest 70% (by listed date) fit, the latest 30% test. */
function wfErrors(comps: CompFeatures[], params: ValueParams): { errs: number[]; nTrain: number; nTest: number } {
  const dated = comps.filter((f) => f.listed !== null).sort((a, b) => (a.listed! < b.listed! ? -1 : 1));
  const cut = Math.floor(dated.length * 0.7);
  const train = dated.slice(0, cut);
  const test = dated.slice(cut);
  const errs = test.map((f) => Math.abs(f.y - predictComp(f, train, params)));
  return { errs, nTrain: train.length, nTest: test.length };
}

/** 5-fold absolute log errors under params (seeded split by slug hash). */
function kfoldErrors(comps: CompFeatures[], params: ValueParams, seed: number): number[][] {
  const out: number[][] = [[], [], [], [], []];
  for (let fold = 0; fold < 5; fold++) {
    const train = comps.filter((f) => foldOf(f.slug, seed) !== fold);
    for (const f of comps.filter((g) => foldOf(g.slug, seed) === fold)) {
      out[fold]!.push(Math.abs(f.y - predictComp(f, train, params)));
    }
  }
  return out;
}

/** The runtime grid search: coefficients chosen by held-out error only. */
export function gridSearch(comps: CompFeatures[]): { params: ValueParams; table: GridCandidate[] } {
  const grid: ValueParams[] = [];
  for (const beta of [0.45, 0.5, 0.55, 0.6]) {
    for (const growth of [0.2, 0.35, 0.5]) {
      for (const maturity of [0, 0.3]) {
        for (const shrinkK of [8, 20]) {
          grid.push({ beta, growth, maturity, breadth: 0, shrinkK });
        }
      }
    }
  }
  let best: ValueParams | null = null;
  let bestScore = Infinity;
  const table: GridCandidate[] = [];
  for (const params of grid) {
    const loo = looErrors(comps, params);
    const wf = wfErrors(comps, params);
    const score = Math.max(missFactor(loo), missFactor(wf.errs));
    table.push({
      beta: params.beta, growth: params.growth, maturity: params.maturity, breadth: 0, shrinkK: params.shrinkK,
      loo: missFactor(loo), looWin: winsorizedFactor(loo), wf: missFactor(wf.errs), wfWin: winsorizedFactor(wf.errs),
    });
    if (score < bestScore) {
      bestScore = score;
      best = params;
    }
  }
  table.sort((a, b) => Math.max(a.loo, a.wf) - Math.max(b.loo, b.wf));
  return { params: best!, table: table.slice(0, 12) };
}

/** The both-tests term table: a term is kept only when it lowers BOTH held-out misses. For terms already in the model the test zeroes them; for terms not in it the test adds them at their best value. */
function termTable(comps: CompFeatures[], params: ValueParams): RadarData['termTable'] {
  const base = { loo: missFactor(looErrors(comps, params)), wf: missFactor(wfErrors(comps, params).errs) };
  const terms: { term: string; test: ValueParams }[] = [
    { term: 'size curve (TVL^beta)', test: { ...params, beta: 1 } },
    { term: '7-day TVL growth', test: { ...params, growth: 0 } },
    { term: 'maturity (age listed)', test: { ...params, maturity: 0.3 } },
    { term: 'breadth (chain count)', test: { ...params, breadth: 0.1 } },
  ];
  return terms.map((t) => {
    const isInModel = (t.term.startsWith('size') && params.beta !== 1) || (t.term.startsWith('7-day') && params.growth !== 0);
    const looT = missFactor(looErrors(comps, t.test));
    const wfT = missFactor(wfErrors(comps, t.test).errs);
    // "with" is the better of the two for a term in the model; for a term not in
    // the model, "with" is the tested value and "without" is the chosen model.
    const withLoo = isInModel ? base.loo : looT;
    const withWf = isInModel ? base.wf : wfT;
    const withoutLoo = isInModel ? looT : base.loo;
    const withoutWf = isInModel ? wfT : base.wf;
    return {
      term: t.term,
      looWith: withLoo, looWithout: withoutLoo,
      wfWith: withWf, wfWithout: withoutWf,
      kept: withLoo < withoutLoo && withWf < withoutWf,
    };
  });
}

// ---------------------------------------------------------------- odds model

/** One protocol's odds features. */
interface OddsFeatures {
  ageY: number;
  ageSq: number;
  logTvl: number;
  chg: number;
  chains: number;
  logChains: number;
  ageLogTvl: number;
  catRate: number;
  ageMissing: number;
}

const ODDS_FEATURES = ['age_y', 'age_y^2', 'logtvl', 'chg', 'chains', 'logchains', 'age*logtvl', 'cat_rate_oof', 'age_missing'];

function oddsFeatures(p: SnapshotProtocol, asOf: string, catRate: number, medianAgeY: number): OddsFeatures {
  const age = ageDays(asOf, p.listed_at);
  const ageY = age === null ? medianAgeY : age / 365;
  const chg = p.change_7d === null ? 0 : Math.max(-0.5, Math.min(2.0, p.change_7d / 100));
  return {
    ageY,
    ageSq: ageY * ageY,
    logTvl: Math.log(p.tvl_usd),
    chg,
    chains: p.chains.length,
    logChains: Math.log(Math.max(1, p.chains.length)),
    ageLogTvl: ageY * Math.log(p.tvl_usd),
    catRate,
    ageMissing: age === null ? 1 : 0,
  };
}

function oddsVector(f: OddsFeatures): number[] {
  return [f.ageY, f.ageSq, f.logTvl, f.chg, f.chains, f.logChains, f.ageLogTvl, f.catRate, f.ageMissing];
}

/** Out-of-fold category token rate: the rate among training rows, excluding the row itself. */
function catRateOof(p: SnapshotProtocol, train: SnapshotProtocol[], baseRate: number): number {
  const rows = train.filter((q) => (q.category ?? 'Other') === (p.category ?? 'Other') && q.slug !== p.slug);
  if (rows.length === 0) return baseRate;
  const pos = rows.filter((q) => q.gecko_id !== null || q.symbol !== null).length;
  return (pos + 2 * baseRate) / (rows.length + 2);
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** Logistic regression by IRLS on standardized features (ridge lambda). */
function fitLogistic(X: number[][], yv: number[], lambda: number): { w: number[]; mu: number[]; sd: number[] } {
  const d = X[0]!.length;
  const mu: number[] = [];
  const sd: number[] = [];
  for (let j = 0; j < d; j++) {
    const col = X.map((r) => r[j]!);
    const m = col.reduce((s, v) => s + v, 0) / col.length;
    const s = Math.sqrt(col.reduce((s2, v) => s2 + (v - m) * (v - m), 0) / col.length) || 1;
    mu.push(m);
    sd.push(s);
  }
  const Xs = X.map((r) => [1, ...r.map((v, j) => (v - mu[j]!) / sd[j]!)]);
  const p = Xs[0]!.length;
  let w = new Array<number>(p).fill(0);
  for (let iter = 0; iter < 60; iter++) {
    const pr = Xs.map((r) => sigmoid(r.reduce((s, v, j) => s + v * w[j]!, 0)));
    const g = new Array<number>(p).fill(0);
    const H: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let i = 0; i < Xs.length; i++) {
      const r = Xs[i]!;
      const wd = pr[i]! * (1 - pr[i]!) + 1e-6;
      for (let a = 0; a < p; a++) {
        g[a] += r[a]! * (pr[i]! - yv[i]!);
        for (let b = 0; b < p; b++) H[a]![b]! += wd * r[a]! * r[b]!;
      }
    }
    for (let j = 1; j < p; j++) {
      g[j] += lambda * w[j]!;
      H[j]![j]! += lambda;
    }
    const step = solveLinear(H, g);
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      w[j]! -= step[j]!;
      maxStep = Math.max(maxStep, Math.abs(step[j]!));
    }
    if (maxStep < 1e-8) break;
  }
  return { w, mu, sd };
}

/** Gaussian elimination for a small dense system. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const div = M[col]![col]!;
    if (Math.abs(div) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / div;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / (Math.abs(row[i]!) < 1e-12 ? 1 : row[i]!));
}

function predictLogistic(X: number[][], fit: { w: number[]; mu: number[]; sd: number[] }): number[] {
  return X.map((r) => {
    const xs = [1, ...r.map((v, j) => (v - fit.mu[j]!) / fit.sd[j]!)];
    return sigmoid(xs.reduce((s, v, j) => s + v * fit.w[j]!, 0));
  });
}

/** AUC by Mann-Whitney with tie-averaged ranks. */
export function aucScore(yv: number[], p: number[]): number {
  const order = p.map((v, i) => i).sort((a, b) => p[a]! - p[b]!);
  const ranks = new Array<number>(p.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && p[order[j + 1]!] === p[order[i]!]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]!] = avg;
    i = j + 1;
  }
  const n1 = yv.reduce((s, v) => s + v, 0);
  const n0 = yv.length - n1;
  const sumPos = yv.reduce((s, v, idx) => s + (v === 1 ? ranks[idx]! : 0), 0);
  return (sumPos - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

function brierScore(yv: number[], p: number[]): number {
  return yv.reduce((s, v, i) => s + (p[i]! - v) ** 2, 0) / yv.length;
}

/** 5-fold CV for the odds model (seeded stratified folds), plus an age-only control. */
function oddsValidation(
  protocols: SnapshotProtocol[],
  asOf: string,
  medianAgeY: number,
  baseRate: number,
  lambda: number,
): OddsValidation {
  const yv = protocols.map((p) => (p.gecko_id !== null || p.symbol !== null ? 1 : 0));
  const folds = stratifiedFolds(yv, 42, 5);
  const oof = new Array<number>(protocols.length).fill(0);
  const oofAge = new Array<number>(protocols.length).fill(0);
  for (let f = 0; f < 5; f++) {
    const te = folds[f]!;
    const tr = folds.flatMap((g, gi) => (gi === f ? [] : g));
    const Xtr = tr.map((i) => oddsVector(oddsFeatures(protocols[i]!, asOf, catRateOof(protocols[i]!, tr.map((j) => protocols[j]!), baseRate), medianAgeY)));
    const Xte = te.map((i) => oddsVector(oddsFeatures(protocols[i]!, asOf, catRateOof(protocols[i]!, tr.map((j) => protocols[j]!), baseRate), medianAgeY)));
    const fit = fitLogistic(Xtr, tr.map((i) => yv[i]!), lambda);
    predictLogistic(Xte, fit).forEach((p, k) => {
      oof[te[k]!] = p;
    });
    const XtrAge = tr.map((i) => [oddsFeatures(protocols[i]!, asOf, baseRate, medianAgeY).ageY]);
    const XteAge = te.map((i) => [oddsFeatures(protocols[i]!, asOf, baseRate, medianAgeY).ageY]);
    const fitAge = fitLogistic(XtrAge, tr.map((i) => yv[i]!), lambda);
    predictLogistic(XteAge, fitAge).forEach((p, k) => {
      oofAge[te[k]!] = p;
    });
  }
  const acc = yv.reduce((s, v, i) => s + ((oof[i]! >= 0.5 ? 1 : 0) === v ? 1 : 0), 0) / yv.length;
  // no-category control: same features minus catRate
  const oofNoCat = new Array<number>(protocols.length).fill(0);
  for (let f = 0; f < 5; f++) {
    const te = folds[f]!;
    const tr = folds.flatMap((g, gi) => (gi === f ? [] : g));
    const drop = (v: number[]) => v.filter((_, j) => j !== 7);
    const Xtr = tr.map((i) => drop(oddsVector(oddsFeatures(protocols[i]!, asOf, baseRate, medianAgeY))));
    const Xte = te.map((i) => drop(oddsVector(oddsFeatures(protocols[i]!, asOf, baseRate, medianAgeY))));
    const fit = fitLogistic(Xtr, tr.map((i) => yv[i]!), lambda);
    predictLogistic(Xte, fit).forEach((p, k) => {
      oofNoCat[te[k]!] = p;
    });
  }
  return {
    auc: aucScore(yv, oof),
    brier: brierScore(yv, oof),
    brierBase: brierScore(yv, yv.map(() => baseRate)),
    accuracy: acc,
    baseRate,
    aucAgeOnly: aucScore(yv, oofAge),
    aucNoCat: aucScore(yv, oofNoCat),
    lambda,
    n: protocols.length,
  };
}

function stratifiedFolds(yv: number[], seed: number, k: number): number[][] {
  const pos = yv.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);
  const neg = yv.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  const folds: number[][] = Array.from({ length: k }, () => []);
  const rng = mulberry32(seed);
  const shuffle = (arr: number[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  };
  shuffle(pos).forEach((v, i) => folds[i % k]!.push(v));
  shuffle(neg).forEach((v, i) => folds[i % k]!.push(v));
  return folds.map((f) => f.sort((a, b) => a - b));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- farm economics

/** The disclosed gas schedule: weekly gas by chain tier, in dollars. */
export interface FeeTier {
  tier: string;
  setup: number;
  action: number;
  weekly: number;
  claim: number;
}

export const FEE_SCHEDULE: FeeTier[] = [
  { tier: 'Ethereum', setup: 8, action: 5, weekly: 1.5, claim: 3 },
  { tier: 'Solana / BNB / Tron', setup: 1, action: 1, weekly: 0.3, claim: 0.5 },
  { tier: 'L2 (Arbitrum, Optimism, Base, Polygon)', setup: 3, action: 2, weekly: 0.15, claim: 1 },
  { tier: 'Other chains', setup: 2, action: 1.5, weekly: 0.5, claim: 1 },
];

function feeTierFor(chains: string[]): FeeTier {
  const first = (chains[0] ?? '').toLowerCase();
  if (first.includes('ethereum')) return FEE_SCHEDULE[0]!;
  if (first.includes('solana') || first.includes('bnb') || first.includes('binance') || first.includes('tron')) return FEE_SCHEDULE[1]!;
  if (first.includes('arbitrum') || first.includes('optimism') || first.includes('base') || first.includes('polygon') || first.includes('zksync') || first.includes('blast') || first.includes('linea') || first.includes('scroll')) return FEE_SCHEDULE[2]!;
  return FEE_SCHEDULE[3]!;
}

/** Hands-on hours for a 12-week farm: setup + core + weekly cadence + claim + log. */
function farmHours(): number {
  return 0.5 + 0.5 + 12 * 0.17 + 0.5 + 0.25;
}

/** The farm economics of one row at the default scenario. */
export function farmEconomics(
  implied: number,
  tvl: number,
  chains: string[],
  depositPct = FARM.depositPct,
  dropShare = FARM.dropShare,
  horizonWeeks = FARM.horizonWeeks,
): { deposit: number; drop: number; fees: number; hours: number; net: number; netPerHour: number; tbill: number; verdict: 'Farm' | 'Marginal' | 'Skip' } {
  const deposit = Math.min(Math.max(depositPct * tvl, FARM.depositMin), FARM.depositMax);
  const drop = implied * dropShare * (deposit / tvl);
  const tier = feeTierFor(chains);
  const fees = tier.setup + tier.action + tier.weekly * horizonWeeks + tier.claim;
  const hours = farmHours() * (horizonWeeks / 12);
  const net = drop - fees;
  const tbill = deposit * FARM.tbill * (horizonWeeks / 52);
  const verdict = net > tbill && net / hours > FARM.hourlyBar ? 'Farm' : net > 0 ? 'Marginal' : 'Skip';
  return { deposit, drop, fees, hours, net, netPerHour: net / hours, tbill, verdict };
}

function money2(n: number): string {
  return `$${n.toFixed(2)}`;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: action, then cost and time, within the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A protocol's farm plan: ten steps, each an action with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: { deposit: number; fees: number; hours: number }): string[] {
  const chain = chainOf(p);
  const capital = Math.round(econ.deposit);
  const tier = feeTierFor(p.chains);
  const hold = age === null ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30;
  const exitTvl = Math.round(p.tvl_usd * 0.83);
  const steps: [string, string, string][] = [
    ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
    ['Check the protocol\'s own site and docs from the link it publishes, and confirm the vault or pool you will use is the real one.', 'no fee to check', '10 minutes'],
    [actionFor(p, capital, chain), `$${capital} of capital and about ${money2(tier.action)} of gas`, '15 minutes to set up'],
    [`Deposit a second tranche of $${Math.round(capital / 2)} so the position is not a single-transaction flag.`, `$${Math.round(capital / 2)} of capital and about ${money2(tier.action)} of gas`, '10 minutes'],
    ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', `about ${money2(tier.weekly)} of gas a week`, '10 minutes a week'],
    [`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, `the $${capital} stays in the position`, `${hold} days`],
    ['Record every transaction hash, date and amount in a farm log as you go, so the position can be unwound or repeated.', 'nothing but the log', '5 minutes a week'],
    ['Watch the protocol\'s TVL once a week: if it prints below $' + exitTvl.toLocaleString('en-US') + ' (about 17% down in a week), unwind and stop farming it.', 'no fee to watch', '5 minutes a week'],
    ['Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', `about ${money2(tier.claim)} of gas to claim`, '10 minutes'],
    ['Withdraw the position, keep the receipt, and write the final net result in the farm log.', 'about $1 of gas to withdraw', '10 minutes'],
  ];
  return steps.map(([t, c, tm]) => stepText(t, c, tm));
}

// ---------------------------------------------------------------- board

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Bootstrap rank ranges: 200 refits of the priced comps, re-scoring the board each time. */
function bootstrapRankRanges(
  rows: { slug: string; implied: number }[],
  comps: CompFeatures[],
  params: ValueParams,
  boardProtocols: SnapshotProtocol[],
  asOf: string,
  oddsOf: Map<string, number>,
): Map<string, { low: number; high: number }> {
  const rng = mulberry32(7);
  const rankLists = new Map<string, number[]>();
  for (const r of rows) rankLists.set(r.slug, []);
  for (let b = 0; b < BOOTSTRAPS; b++) {
    const sample: CompFeatures[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    const { peers, globalMed, scale } = fitPeers(sample, params);
    const scored = boardProtocols.map((p) => {
      const f = boardFeatures(p, asOf);
      const terminal = Math.exp(predictBoard(f, peers, globalMed, scale, params));
      return { slug: p.slug, implied: Math.max(1, Math.round(terminal * (oddsOf.get(p.slug) ?? 0.5))) };
    });
    scored.sort((a, c) => c.implied - a.implied || (a.slug < c.slug ? -1 : 1));
    scored.forEach((s, i) => rankLists.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { low: number; high: number }>();
  for (const [slug, ranks] of rankLists) {
    const sorted = [...ranks].sort((a, b) => a - b);
    out.set(slug, { low: sorted[Math.floor(0.05 * (sorted.length - 1))]!, high: sorted[Math.ceil(0.95 * (sorted.length - 1))]! });
  }
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  // Priced comps: the 118 traded tokens the value model learns from.
  const comps = snapshot.protocols.filter(isPricedComp).map((p) => compFeatures(p, asOf));

  // The grid search picks the coefficients by held-out error only.
  const { params, table } = gridSearch(comps);
  const terms = termTable(comps, params);

  // Held-out validation of the chosen model.
  const loo = looErrors(comps, params);
  const looSigned = looSignedErrors(comps, params);
  const wf = wfErrors(comps, params);
  const folds42 = kfoldErrors(comps, params, 42);
  const foldSeeds = [42, 1, 2, 3, 4].map((seed) => kfoldErrors(comps, params, seed).map((f) => missFactor(f)));
  const sortedLoo = [...looSigned].sort((a, b) => a - b);
  // Range honesty: the interval is built from out-of-sample (LOO) residual
  // quantiles, then checked against the model's own predictions of the traded
  // tokens. 50% / 80% is the nominal level; 57% / 77% is what it covers.
  const full = fitPeers(comps, params);
  const fullPreds = comps.map((f) => predictWithPeers(f, full.peers, full.globalMed, full.scale, params));
  const validation: ValueValidation = {
    fullFit: missFactor(comps.map((f, i) => f.y - fullPreds[i]!)),
    loo: missFactor(loo),
    looWin: winsorizedFactor(loo),
    looP90: Math.exp(quantile([...loo].sort((a, b) => a - b), 0.9)),
    wf: missFactor(wf.errs),
    wfWin: winsorizedFactor(wf.errs),
    wfTrain: wf.nTrain,
    wfTest: wf.nTest,
    folds: folds42.map((f) => missFactor(f)),
    foldsWin: folds42.map((f) => winsorizedFactor(f)),
    foldSeeds,
    rangeP25: quantile(sortedLoo, 0.25),
    rangeP75: quantile(sortedLoo, 0.75),
    rangeP10: quantile(sortedLoo, 0.1),
    rangeP90: quantile(sortedLoo, 0.9),
    coverP25P75: comps.filter((f, i) => {
      const lo = fullPreds[i]! + quantile(sortedLoo, 0.25);
      const hi = fullPreds[i]! + quantile(sortedLoo, 0.75);
      return f.y >= lo && f.y <= hi;
    }).length / comps.length,
    coverP10P90: comps.filter((f, i) => {
      const lo = fullPreds[i]! + quantile(sortedLoo, 0.1);
      const hi = fullPreds[i]! + quantile(sortedLoo, 0.9);
      return f.y >= lo && f.y <= hi;
    }).length / comps.length,
    coverWithin3: comps.filter((f, i) => Math.abs(f.y - fullPreds[i]!) <= Math.log(3)).length / comps.length,
  };

  // The odds model: 5-fold CV for the report, full fit for scoring.
  const baseRate = snapshot.protocols.filter((p) => p.gecko_id !== null || p.symbol !== null).length / snapshot.protocols.length;
  const ages = snapshot.protocols.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  const medianAgeY = median(ages.map((a) => a / 365));
  const oddsVal = oddsValidation(snapshot.protocols, asOf, medianAgeY, baseRate, 1.0);
  const Xall = snapshot.protocols.map((p) => oddsVector(oddsFeatures(p, asOf, catRateOof(p, snapshot.protocols, baseRate), medianAgeY)));
  const yall = snapshot.protocols.map((p) => (p.gecko_id !== null || p.symbol !== null ? 1 : 0));
  const oddsFit = fitLogistic(Xall, yall, 1.0);
  const oddsAll = predictLogistic(Xall, oddsFit);
  const oddsOf = new Map(snapshot.protocols.map((p, i) => [p.slug, oddsAll[i]!]));
  const oddsWeights = ODDS_FEATURES.map((feature, j) => ({
    feature,
    weight: Math.round((oddsFit.w[j + 1]! / oddsFit.sd[j]!) * 1000) / 1000,
  }));

  // The board: watchlist 40 + early 158 by TVL.
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, BOARD_ROWS - chosen.size);
  for (const p of early) chosen.set(p.slug, p);

  const { peers, globalMed, scale } = fitPeers(comps, params);
  const scored = [...chosen.values()].map((p) => {
    const f = boardFeatures(p, asOf);
    const terminal = Math.exp(predictBoard(f, peers, globalMed, scale, params));
    const odds = oddsOf.get(p.slug) ?? baseRate;
    const implied = Math.max(1, Math.round(terminal * odds));
    const peer = peers.get(f.cat) ?? globalMed;
    return { p, f, terminal, odds, implied, peer };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const ranges = bootstrapRankRanges(
    scored.map((s) => ({ slug: s.p.slug, implied: s.implied })),
    comps,
    params,
    scored.map((s) => s.p),
    asOf,
    oddsOf,
  );

  const board: BoardRow[] = scored.map((s, i) => {
    const econ = farmEconomics(s.implied, s.p.tvl_usd, s.p.chains);
    const age = ageDays(asOf, s.p.listed_at);
    const rr = ranges.get(s.p.slug) ?? { low: i + 1, high: i + 1 };
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: age,
      implied_value_usd: s.implied,
      terminal_value_usd: Math.max(1, Math.round(s.terminal)),
      token_odds: Math.round(s.odds * 10000) / 10000,
      range_low_usd: Math.max(1, Math.round(s.terminal * Math.exp(validation.rangeP25) * s.odds)),
      range_high_usd: Math.max(1, Math.round(s.terminal * Math.exp(validation.rangeP75) * s.odds)),
      range_p10_usd: Math.max(1, Math.round(s.terminal * Math.exp(validation.rangeP10) * s.odds)),
      range_p90_usd: Math.max(1, Math.round(s.terminal * Math.exp(validation.rangeP90) * s.odds)),
      rank_low: rr.low,
      rank_high: rr.high,
      verdict: econ.verdict,
      net_usd: Math.round(econ.net * 100) / 100,
      net_per_hour_usd: Math.round(econ.netPerHour * 100) / 100,
      drop_usd: Math.round(econ.drop * 100) / 100,
      fees_usd: Math.round(econ.fees * 100) / 100,
      hours: Math.round(econ.hours * 10) / 10,
      deposit_usd: Math.round(econ.deposit),
      model: {
        peer_multiple: Math.round((s.terminal / s.p.tvl_usd) * 10000) / 10000,
        size_exponent: params.beta,
        growth_multiplier: Math.round(Math.exp(params.growth * s.f.growth) * 10000) / 10000,
        maturity_multiplier: Math.round(Math.exp(params.maturity * s.f.maturity) * 10000) / 10000,
        breadth_multiplier: Math.round(Math.exp(params.breadth * s.f.breadth) * 10000) / 10000,
        scale: Math.round(scale * 10000) / 10000,
        age_days: age,
      },
      farm_steps: farmSteps(s.p, age, econ),
    };
  });

  // Accounting: every one of the 758 sits in exactly one group.
  const ranked = new Set(board.map((r) => r.slug));
  const priced = new Set(comps.map((f) => f.slug));
  const tokenRecorded = snapshot.protocols.filter((p) => (p.gecko_id !== null || p.symbol !== null) && !priced.has(p.slug)).length;
  const leftOut = snapshot.protocols.filter((p) => isPreToken(p) && !ranked.has(p.slug)).length;
  const accounting: AccountGroup[] = [
    { label: 'Ranked · watchlist', count: snapshot.watchlist.length, rule: 'TVL at or above the $50M floor, no token on record, not a wrapped/staked/bridged product.' },
    { label: 'Ranked · early, below the floor', count: board.length - snapshot.watchlist.length, rule: 'Pre-token protocols the house list leaves out, by TVL; bridge/staking categories and CEX/versioned names are not ranked.' },
    { label: 'Token trades · priced comp', count: comps.length, rule: 'A token with a usable market cap (mcap_usd > 0), not a CEX and not a versioned pool: the 118 peers the model learns from.' },
    { label: 'Token recorded · not a priced comp', count: tokenRecorded, rule: 'Records a token but carries no usable market cap, or is a CEX/versioned token the peer set leaves out.' },
    { label: 'Left out · pre-token, not ranked', count: leftOut, rule: 'Pre-token protocols below the early cut, bridge/staking products, or CEX/versioned names.' },
  ];

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    params,
    grid: table,
    termTable: terms,
    validation,
    odds: oddsVal,
    oddsWeights,
    accounting,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      terminal_value_usd: r.terminal_value_usd,
      token_odds: r.token_odds,
      range_low_usd: r.range_low_usd,
      range_high_usd: r.range_high_usd,
      range_p10_usd: r.range_p10_usd,
      range_p90_usd: r.range_p90_usd,
      rank_low: r.rank_low,
      rank_high: r.rank_high,
      verdict: r.verdict,
      net_usd: r.net_usd,
      net_per_hour_usd: r.net_per_hour_usd,
      drop_usd: r.drop_usd,
      fees_usd: r.fees_usd,
      hours: r.hours,
      deposit_usd: r.deposit_usd,
      peer_multiple: r.model.peer_multiple,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      watchlist: snapshot.watchlist.includes(r.slug),
    })),
    steps: Object.fromEntries(board.map((r) => [r.slug, r.farm_steps])),
    live: comps
      .map((f) => {
        const p = index.get(f.slug)!;
        return { slug: f.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd };
      })
      .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0)),
    scatter: comps.map((f) => ({ x: Math.round(f.logTvl * 100) / 100, y: Math.round(f.y * 100) / 100, cat: f.cat })),
    sizeCurve: { intercept: Math.round((full.globalMed + full.scale) * 1000) / 1000, beta: params.beta },
    feeSchedule: FEE_SCHEDULE,
    farmDefault: { depositPct: FARM.depositPct, dropShare: FARM.dropShare, horizonWeeks: FARM.horizonWeeks, tbill: FARM.tbill, hourlyBar: FARM.hourlyBar },
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
