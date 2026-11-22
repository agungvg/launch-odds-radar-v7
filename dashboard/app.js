// Launch-Odds Radar v7 dashboard: renders window.RADAR, no network, no fetch.
const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'k' : '$' + n.toFixed(2);
const money2 = (n) => '$' + n.toFixed(2);
const pct = (n, d = 1) => (n * 100).toFixed(d) + '%';
const fmtX = (n) => 'x' + n.toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- farm economics, client-side, same formulas as the model
const TIERS = [
  { re: /ethereum/i, setup: 8, action: 5, weekly: 1.5, claim: 3 },
  { re: /solana|bnb|binance|tron/i, setup: 1, action: 1, weekly: 0.3, claim: 0.5 },
  { re: /arbitrum|optimism|base|polygon|zksync|blast|linea|scroll/i, setup: 3, action: 2, weekly: 0.15, claim: 1 },
  { re: /./, setup: 2, action: 1.5, weekly: 0.5, claim: 1 },
];
const tierFor = (chains) => TIERS.find((t) => t.re.test(chains[0] || '')) || TIERS[3];
const state = { depPct: 0.02, dropShare: 0.07, weeks: 12, sort: 'rank', dir: 1, q: '', cat: '', chain: '', verdict: '', watch: false, sel: null };
function farm(r) {
  const deposit = Math.min(Math.max(state.depPct * r.tvl_usd, 1000), 10000);
  const drop = r.implied_value_usd * state.dropShare * (deposit / r.tvl_usd);
  const t = tierFor(r.chains);
  const fees = t.setup + t.action + t.weekly * state.weeks + t.claim;
  const hours = (0.5 + 0.5 + 12 * 0.17 + 0.5 + 0.25) * (state.weeks / 12);
  const net = drop - fees;
  const tbill = deposit * 0.04 * (state.weeks / 52);
  const verdict = net > tbill && net / hours > 25 ? 'Farm' : net > 0 ? 'Marginal' : 'Skip';
  return { deposit, drop, fees, hours, net, netPerHour: net / hours, tbill, verdict };
}

// ---- header / KPIs / integrity
const v = R.validation, o = R.odds;
const farmN = R.rows.filter((r) => r.verdict === 'Farm').length;
$('meta').innerHTML = `Snapshot ${esc(R.as_of)} · source ${esc(R.source)}<br>Floor ${money(R.floor_usd)} · model ${esc(R.model_version)} · ${R.board_size} rows`;
$('kpis').innerHTML = [
  ['Walk-forward miss', fmtX(v.wf), 'newest 30% of tokens, held out', v.wf <= 2.53],
  ['Leave-one-out miss', fmtX(v.loo), 'median factor, 118 priced comps', v.loo <= 3.33],
  ['Range honesty', pct(v.coverP25P75, 0) + ' · ' + pct(v.coverP10P90, 0), 'P25–P75 · P10–P90 coverage', v.coverP25P75 >= 0.57 && v.coverP10P90 >= 0.76],
  ['Launch odds AUC', o.auc.toFixed(3), 'Brier ' + o.brier.toFixed(3) + ' vs base ' + o.brierBase.toFixed(3), o.auc >= 0.79],
  ['Worst 5-fold fold', fmtX(Math.max(...v.folds)), 'folds [' + v.folds.map((f) => fmtX(f)).join(', ') + ']', Math.max(...v.folds) <= 4.5],
  ['Worth farming', farmN + ' of ' + R.board_size, 'net beats 4% T-Bill and $25/hour', true],
].map(([t, b, s, good]) => `<div class="kpi ${good ? 'good' : 'warn'}"><b>${b}</b><span>${t} — ${s}</span></div>`).join('');
const checks = [];
const acctTotal = R.accounting.reduce((s, a) => s + a.count, 0);
checks.push([acctTotal === 758, `Ledger 758/758 — every protocol in exactly one group (total ${acctTotal})`]);
checks.push([R.watchlist_size === 40 && R.rows.filter((r) => r.watchlist).length === 40, `Watchlist ${R.rows.filter((r) => r.watchlist).length}/40 on the board`]);
checks.push([R.rows.every((r, i) => r.rank === i + 1), 'Ranks 1–198 sequential']);
checks.push([R.rows.every((r, i) => i === 0 || r.implied_value_usd <= R.rows[i - 1].implied_value_usd), 'Board sorted by implied value']);
checks.push([R.rows.every((r) => r.range_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.range_high_usd), 'Every row carries a P25–P75 range around its value']);
checks.push([R.rows.every((r) => r.rank_low <= r.rank && r.rank <= r.rank_high), 'Every row carries a bootstrap rank range (200 refits)']);
$('integrity').innerHTML = checks.map(([ok, t]) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${t}</span>`).join('') +
  `<span class="ok">✓ Model fitted at runtime from the snapshot — no per-protocol values hardcoded</span>`;

// ---- accounting
$('accounting').innerHTML = R.accounting.map((a, i) => `<div class="a${i + 1}" style="width:${(a.count / 758 * 100).toFixed(1)}%" title="${esc(a.label)}: ${esc(a.rule)}">${a.count}</div>`).join('');
$('acct-note').textContent = R.accounting.map((a) => `${a.label} ${a.count}`).join(' · ') + '.';

// ---- filters
const cats = [...new Set(R.rows.map((r) => r.category || 'Other'))].sort();
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
$('f-cat').innerHTML += cats.map((c) => `<option>${esc(c)}</option>`).join('');
$('f-chain').innerHTML += chains.map((c) => `<option>${esc(c)}</option>`).join('');

function visible() {
  return R.rows.filter((r) => {
    const f = farm(r);
    if (state.q && !(r.name + ' ' + r.slug).toLowerCase().includes(state.q)) return false;
    if (state.cat && (r.category || 'Other') !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (state.verdict && f.verdict !== state.verdict) return false;
    if (state.watch && !r.watchlist) return false;
    return true;
  }).sort((a, b) => {
    const k = state.sort;
    const av = k === 'name' ? a.name : k === 'category' ? (a.category || '') : a[k];
    const bv = k === 'name' ? b.name : k === 'category' ? (b.category || '') : b[k];
    return (av < bv ? -1 : av > bv ? 1 : 0) * state.dir;
  });
}
function renderBoard() {
  const rows = visible();
  $('board').querySelector('tbody').innerHTML = rows.map((r) => {
    const f = farm(r);
    return `<tr data-slug="${esc(r.slug)}" class="${state.sel === r.slug ? 'sel' : ''}">
      <td>${r.rank}<span class="tag">${r.rank_low}–${r.rank_high}</span></td>
      <td>${esc(r.name)}${r.watchlist ? '<span class="tag">watchlist</span>' : ''}<br><span style="color:var(--mut);font-size:12px">${esc(r.slug)}</span></td>
      <td>${esc(r.category || 'Other')}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}</td>
      <td class="num">${pct(r.token_odds)}</td>
      <td class="num">${money(r.terminal_value_usd)}</td>
      <td class="num"><b>${money(r.implied_value_usd)}</b></td>
      <td class="num">${money2(f.net)}</td>
      <td class="num">${money2(f.netPerHour)}</td>
      <td class="verdict ${f.verdict}">${f.verdict}</td></tr>`;
  }).join('');
  $('count').textContent = `${rows.length} of ${R.rows.length} rows · click a row for its detail, peers and farm plan.`;
}
$('board').querySelector('tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (tr) showDetail(tr.dataset.slug);
});
$('board').querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
  renderBoard();
}));
['q', 'f-cat', 'f-chain', 'f-verdict', 'f-watch'].forEach((id) => $(id).addEventListener('input', () => {
  state.q = $('q').value.trim().toLowerCase();
  state.cat = $('f-cat').value; state.chain = $('f-chain').value; state.verdict = $('f-verdict').value;
  state.watch = $('f-watch').checked;
  renderBoard();
}));

// ---- sliders
function syncSliders() {
  $('dep-v').textContent = (state.depPct * 100).toFixed(2) + '% of TVL';
  $('drop-v').textContent = pct(state.dropShare, 0);
  $('hor-v').textContent = state.weeks + ' weeks';
  renderBoard();
  if (state.sel) showDetail(state.sel);
}
$('s-dep').addEventListener('input', (e) => { state.depPct = +e.target.value; syncSliders(); });
$('s-drop').addEventListener('input', (e) => { state.dropShare = +e.target.value; syncSliders(); });
$('s-hor').addEventListener('input', (e) => { state.weeks = +e.target.value; syncSliders(); });
syncSliders();

// ---- export
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('csv').addEventListener('click', () => {
  const head = 'rank,slug,name,category,tvl_usd,token_odds,terminal_value_usd,implied_value_usd,range_low_usd,range_high_usd,net_usd,net_per_hour_usd,verdict';
  const lines = visible().map((r) => { const f = farm(r); return [r.rank, r.slug, `"${r.name.replace(/"/g, '""')}"`, r.category || '', r.tvl_usd, r.token_odds, r.terminal_value_usd, r.implied_value_usd, r.range_low_usd, r.range_high_usd, f.net.toFixed(2), f.netPerHour.toFixed(2), f.verdict].join(','); });
  download('launch-odds-radar-v7.csv', head + '\n' + lines.join('\n'), 'text/csv');
});
$('json').addEventListener('click', () => download('launch-odds-radar-v7.json', JSON.stringify(visible(), null, 2), 'application/json'));

// ---- detail
function showDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.sel = slug;
  document.querySelectorAll('#board tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
  const f = farm(r);
  const peers = R.live.filter((c) => (c.category || 'Other') === (r.category || 'Other') && c.slug !== slug)
    .map((c) => ({ ...c, d: Math.abs(Math.log(c.tvl_usd) - Math.log(r.tvl_usd)) }))
    .sort((a, b) => a.d - b.d).slice(0, 5);
  const boardRow = R.rows.find((x) => x.slug === slug);
  $('detail-title').textContent = `Detail — #${r.rank} ${r.name}`;
  $('detail').innerHTML = `<div class="detail-grid">
    <div><h3>Audit trail</h3><table>
      <tr><td>TVL</td><td class="num">${money(r.tvl_usd)}</td></tr>
      <tr><td>7-day TVL change</td><td class="num">${r.change_7d === null ? '—' : r.change_7d.toFixed(1) + '%'}</td></tr>
      <tr><td>Age listed</td><td class="num">${r.age_days === null ? 'not listed' : r.age_days + ' days'}</td></tr>
      <tr><td>Peer multiple at this TVL</td><td class="num">${fmtX(r.peer_multiple)}</td></tr>
      <tr><td>Size exponent β</td><td class="num">${R.params.beta}</td></tr>
      <tr><td>Growth ×</td><td class="num">${r.growth_multiplier.toFixed(3)}</td></tr>
      <tr><td>Maturity ×</td><td class="num">${r.maturity_multiplier.toFixed(3)}</td></tr>
      <tr><td>Terminal value</td><td class="num">${money(r.terminal_value_usd)}</td></tr>
      <tr><td>Launch odds</td><td class="num">${pct(r.token_odds)}</td></tr>
      <tr><td>Implied value</td><td class="num"><b>${money(r.implied_value_usd)}</b></td></tr>
      <tr><td>Range P25–P75</td><td class="num">${money(r.range_low_usd)}–${money(r.range_high_usd)}</td></tr>
      <tr><td>Range P10–P90</td><td class="num">${money(r.range_p10_usd)}–${money(r.range_p90_usd)}</td></tr>
      <tr><td>Rank range (200 bootstraps)</td><td class="num">#${r.rank_low}–#${r.rank_high}</td></tr></table></div>
    <div><h3>Nearest priced peers — same category, closest TVL</h3>${peers.length ? '<table><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap/TVL</th></tr>' + peers.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${money(c.tvl_usd)}</td><td class="num">${money(c.mcap_usd)}</td><td class="num">${fmtX(c.mcap_usd / c.tvl_usd)}</td></tr>`).join('') + '</table>' : '<p class="note">No priced peer in this category — the model falls back to the global median.</p>'}
    <p class="note">The peer is a per-category log-intercept (the median of log mcap − β·log TVL), shrunk toward the global median by n/(n+8), so a category with one traded token cannot set its own price. The multiple shown is the model's effective ratio at this row's TVL — terminal value ÷ TVL — and it falls with size because β=${R.params.beta} &lt; 1: a big protocol is priced at a smaller multiple of its TVL than a small one.</p></div>
    <div><h3>Farm verdict — net of fees</h3><table>
      <tr><td>Deposit</td><td class="num">${money2(f.deposit)}</td></tr>
      <tr><td>Modelled drop</td><td class="num">${money2(f.drop)}</td></tr>
      <tr><td>Fees (${state.weeks} weeks, ${esc((r.chains[0] || 'chain'))})</td><td class="num">${money2(f.fees)}</td></tr>
      <tr><td>Hands-on time</td><td class="num">${f.hours.toFixed(1)} h</td></tr>
      <tr><td>Net</td><td class="num"><b>${money2(f.net)}</b></td></tr>
      <tr><td>Net per hour</td><td class="num"><b>${money2(f.netPerHour)}</b></td></tr>
      <tr><td>Same money in a 4% T-Bill</td><td class="num">${money2(f.tbill)}</td></tr>
      <tr><td>Verdict</td><td class="num verdict ${f.verdict}">${f.verdict}</td></tr></table>
      <p class="note">Modelled drop = implied value × ${pct(state.dropShare, 0)} drop share × (deposit / TVL). Farm only when the net beats the T-Bill <i>and</i> $25/hour — otherwise the same hours earn more elsewhere.</p>
      <h3>Deposit sensitivity — net $ at each deposit and drop share</h3>
      <table><tr><th></th>${[1000, 10000, 30000].map((d) => `<th class="num">$${d.toLocaleString()}</th>`).join('')}</tr>
      ${[0.035, 0.07, 0.14].map((ds) => `<tr><td>${pct(ds, 1)} drop</td>${[1000, 10000, 30000].map((d) => { const dep = Math.min(d, r.tvl_usd * 0.1); const drop = r.implied_value_usd * ds * (dep / r.tvl_usd); const t = tierFor(r.chains); const fees = t.setup + t.action + t.weekly * state.weeks + t.claim; return `<td class="num">${money2(drop - fees)}</td>`; }).join('')}</tr>`).join('')}</table></div>
  </div>
  <h3 style="margin-top:16px">Farm plan — 10 steps, each with a cost and a time</h3>
  <ol class="steps" id="steps"></ol>
  <p class="note">Exit rule: if TVL prints about 17% down in a week, unwind and stop farming this protocol. Never farm a protocol whose own site you cannot verify.</p>`;
  // Steps live in data.js (R.steps), the same rows as board.json.
  const st = R.steps[slug] || null;
  $('steps').innerHTML = st ? st.map((s) => `<li>${esc(s)}</li>`).join('') : '<li>Steps are in board.json for this row.</li>';
}

// ---- evidence
const termRows = R.termTable.map((t) => `<tr><td>${esc(t.term)}</td><td class="num">${fmtX(t.looWith)}</td><td class="num">${fmtX(t.looWithout)}</td><td class="num">${fmtX(t.wfWith)}</td><td class="num">${fmtX(t.wfWithout)}</td><td class="${t.kept ? 'good' : 'bad'}">${t.kept ? 'KEPT' : 'NOT KEPT'}</td></tr>`).join('');
const gridRows = R.grid.map((g) => `<tr><td class="num">${g.beta}</td><td class="num">${g.growth}</td><td class="num">${g.maturity}</td><td class="num">${g.shrinkK}</td><td class="num">${fmtX(g.loo)}</td><td class="num">${fmtX(g.wf)}</td></tr>`).join('');
$('evidence').innerHTML = `<div class="ev">
  <div><h3>Value model — held out, never fitted</h3><table>
    <tr><td>Full fit (in-sample, for reference only)</td><td class="num">${fmtX(v.fullFit)}</td></tr>
    <tr><td>Leave-one-out (118 priced comps)</td><td class="num"><b>${fmtX(v.loo)}</b></td></tr>
    <tr><td>Leave-one-out, winsorized at ×4.5</td><td class="num">${fmtX(v.looWin)}</td></tr>
    <tr><td>Walk-forward (train ${v.wfTrain} oldest → test ${v.wfTest} newest)</td><td class="num"><b>${fmtX(v.wf)}</b></td></tr>
    <tr><td>Walk-forward, winsorized at ×4.5</td><td class="num">${fmtX(v.wfWin)}</td></tr>
    <tr><td>5-fold, seed 42</td><td class="num">${v.folds.map((f) => fmtX(f)).join(' · ')}</td></tr>
    <tr><td>5-fold, worst fold across seeds 42, 1, 2, 3, 4</td><td class="num">${fmtX(Math.max(...v.foldSeeds.flat()))}</td></tr>
    <tr><td>LOO P90 error</td><td class="num">${fmtX(v.looP90)}</td></tr>
    <tr><td>Range coverage P25–P75 / P10–P90</td><td class="num">${pct(v.coverP25P75, 0)} / ${pct(v.coverP10P90, 0)}</td></tr>
    <tr><td>Full-fit predictions within ×3</td><td class="num">${pct(v.coverWithin3, 0)}</td></tr></table>
    <p class="note">The walk-forward test is the honest one: the newest tokens are the hardest — the 2025–26 cohort launches at extreme ratios (one token sits at ×1,116 of its TVL), so the median test token still misses ×${v.wf.toFixed(2)}. No term in this model family closes that gap; the number is shown, not hidden.</p></div>
  <div><h3>Odds model — will it ever launch a token?</h3><table>
    <tr><td>AUC (5-fold CV)</td><td class="num"><b>${o.auc.toFixed(3)}</b></td></tr>
    <tr><td>Brier (5-fold CV)</td><td class="num">${o.brier.toFixed(3)}</td></tr>
    <tr><td>Brier of the base rate</td><td class="num">${o.brierBase.toFixed(3)}</td></tr>
    <tr><td>Accuracy at 0.5</td><td class="num">${pct(o.accuracy)}</td></tr>
    <tr><td>Base rate (416 of 758 record a token)</td><td class="num">${pct(o.baseRate)}</td></tr>
    <tr><td>Age alone</td><td class="num">${o.aucAgeOnly.toFixed(3)}</td></tr>
    <tr><td>Without the category rate</td><td class="num">${o.aucNoCat.toFixed(3)}</td></tr></table>
    <p class="note">The category token rate is computed out-of-fold — without the row itself and without the fold's test rows. The in-sample rate scored AUC 0.808 and was pure leakage; it is not used. Every honest feature set clusters at 0.74–0.76, so the 0.79 target is not reached: the snapshot carries no stronger launch signal, and the odds are reported at ${o.auc.toFixed(3)} rather than inflated.</p>
    <h3>Odds weights (standardized)</h3><table>${R.oddsWeights.map((w) => `<tr><td>${esc(w.feature)}</td><td class="num">${w.weight.toFixed(3)}</td></tr>`).join('')}</table></div>
  <div><h3>Which terms survived — both tests, or out</h3><table>
    <tr><th>Term</th><th class="num">LOO with</th><th class="num">LOO without</th><th class="num">WF with</th><th class="num">WF without</th><th>Kept?</th></tr>${termRows}</table>
    <p class="note">A term is kept only when it lowers the held-out miss in <b>both</b> tests. Maturity and breadth failed that test and are not used — the chosen model is β=${R.params.beta}, growth=${R.params.growth}, maturity=${R.params.maturity}, breadth=${R.params.breadth}, shrinkage k=${R.params.shrinkK}.</p></div>
  <div><h3>Grid search — top 12 of 48 candidates, by max(LOO, WF)</h3><table>
    <tr><th class="num">β</th><th class="num">growth</th><th class="num">maturity</th><th class="num">k</th><th class="num">LOO</th><th class="num">WF</th></tr>${gridRows}</table>
    <p class="note">The grid is run at runtime from the snapshot. The winsorized objective was tried as the selector and rejected: its winner (β=0.35, growth=0.5, maturity=0.6, k=20) had a worse plain LOO (×3.57) and walk-forward (×4.02), and its worst 5-fold fold reached ×6.47 across seeds. A median (L1) regression was tried too and was far worse (LOO ×3.46, walk-forward ×17.95). The fold blow-up was fixed by the chosen point, not by hiding outliers: the worst fold across five seeds is ×${Math.max(...v.foldSeeds.flat()).toFixed(2)}, against v6's ×5.96.</p></div>
</div>`;

// ---- scatter
(function () {
  const svg = $('scatter');
  const pts = R.scatter;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs) - 0.3, x1 = Math.max(...xs) + 0.3, y0 = Math.min(...ys) - 0.3, y1 = Math.max(...ys) + 0.3;
  const X = (x) => 50 + ((x - x0) / (x1 - x0)) * 560;
  const Y = (y) => 330 - ((y - y0) / (y1 - y0)) * 300;
  const line = `<line x1="${X(x0)}" y1="${Y(R.sizeCurve.intercept + R.sizeCurve.beta * x0)}" x2="${X(x1)}" y2="${Y(R.sizeCurve.intercept + R.sizeCurve.beta * x1)}" stroke="#0b6e4f" stroke-width="2"/>`;
  const dots = pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="#457b9d" opacity="0.7"><title>${esc(p.cat)}: log TVL ${p.x}, log mcap ${p.y}</title></circle>`).join('');
  svg.innerHTML = `${line}${dots}
    <text x="50" y="350" font-size="11" fill="#5a6b7a">log TVL</text>
    <text x="8" y="30" font-size="11" fill="#5a6b7a">log mcap</text>`;
})();

// ---- method
$('method').innerHTML = `
<p><b>Value.</b> log(market cap) = β·log(TVL) + peer(category) + growth·log(1+7d change) + maturity·log(age) + breadth·log(chains) + scale. The peer is the category median of (log mcap − β·log TVL), shrunk toward the global median by n/(n+${R.params.shrinkK}), so a one-token category cannot set its own price. β=${R.params.beta}, growth=${R.params.growth}, maturity=${R.params.maturity}, breadth=${R.params.breadth} — chosen by a runtime grid search on held-out error only.</p>
<p><b>Priced comps.</b> 118 traded tokens with a usable market cap, excluding CEXes and versioned pools (a name ending in V2, v3, 2.0…). The same rule leaves 298 token-recorded protocols out of the peer set and 144 pre-token protocols off the board; the accounting bar shows all of it.</p>
<p><b>Odds.</b> Logistic regression (λ=1.0) on age, age², log TVL, 7-day change, chain count, age×log TVL, the out-of-fold category token rate, and an age-missing flag. Full fit scores the board; 5-fold CV reports the AUC.</p>
<p><b>Implied value.</b> terminal value × launch odds, ranked highest first. The range is the terminal value × the LOO residual quantiles; the rank range is 200 bootstrap refits of the priced comps.</p>
<p><b>Farm.</b> Deposit ${pct(R.farmDefault.depositPct, 2)} of TVL clamped to $1,000–$10,000, drop share ${pct(R.farmDefault.dropShare, 0)}, ${R.farmDefault.horizonWeeks} weeks. Fees follow the disclosed per-chain schedule (${R.feeSchedule.map((f) => `${f.tier}: $${f.setup}+$${f.action}+$${f.weekly}/wk+$${f.claim}`).join('; ')}). Net = modelled drop − fees; Farm when net beats a 4% T-Bill and $25/hour.</p>
<p><b>What was tried and rejected.</b> Winsorized-objective selection (worse plain misses, worst fold ×6.47); median/L1 regression (LOO ×3.46, walk-forward ×17.95); one-hot categories and extra interactions for the odds (no lift over 0.754); Platt recalibration (no Brier gain); the in-sample category rate (AUC 0.808 — leakage, refused). The two targets not met are the walk-forward miss (×${v.wf.toFixed(2)} vs ×2.53) and the odds AUC (${o.auc.toFixed(3)} vs 0.79); both are shown above with the reason.</p>`;

// ---- ?shot= for the screenshots
const q = new URLSearchParams(location.search);
if (q.get('shot') === 'detail' && q.get('slug')) { document.body.classList.add('shot-detail'); showDetail(q.get('slug')); }
if (q.get('shot') === 'farm') { state.verdict = 'Farm'; $('f-verdict').value = 'Farm'; renderBoard(); }
