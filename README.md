# launch-odds-radar-v7

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/agungvg/launch-odds-radar-v7/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/agungvg/launch-odds-radar-v7/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch-Odds Radar v7: a token launch radar that prices 198 pre-token protocols from the sealed snapshot — a peer-multiple value model (β=0.55, 7-day growth, shrinkage k=8) chosen by held-out error only, a logistic launch-odds model (AUC 0.764), net-of-fees farm verdicts with $/hour, bootstrap rank ranges, and the full out-of-sample evidence on the dashboard. Held-out: leave-one-out ×3.17, walk-forward ×2.97, worst 5-fold fold ×4.41 (seed 42). Two targets are not met and are shown honestly on the dashboard: the walk-forward miss (×2.97 vs ×2.53) and the odds AUC (0.764 vs 0.79) — the snapshot's recent-cohort tokens and launch signal do not support better numbers without leakage.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=p9r33tb4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
