# AGENTS.md

## Start

Before editing, read:

1. `README.md`
2. `docs/design.md`
3. `docs/agent_visualization.md`
4. `AGENTS.md`

Then run:

```bash
git status --short
git branch --show-current
```

Dirty files are user or peer-agent work. Do not revert or overwrite unrelated
changes. Use Chinese for summaries; keep code, APIs, scripts, and schema names
in English.

## Product Rules

This is a reviewer-facing Hormuz forecast-agent case room, not a generic news
dashboard, trading system, live AIS monitor, or LLM debug viewer.

Core question:

> 当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？

Preserve:

```text
baseline -> source -> observation -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

Hard constraints:

- Pages consume forecast state through `src/state/projections.ts`.
- Canonical state lives in `src/state/canonicalStore.ts`.
- Only `judgement_updated` may change `scenarioDistribution` or
  `targetForecasts`.
- `source_read` and `evidence_added` never change probabilities.
- Market is evidence input only; use `MarketRead.pricingPattern`.
- Do not fake sources, metrics, probabilities, citations, freshness, URLs, or
  `sourceHash`.
- Pending sources remain visibly pending and cannot create high-confidence live
  evidence.
- IEA/EIA Hormuz facts are structural baselines, not real-time throughput.
- UI must not expose raw debug logs, chain-of-thought, or internal prompts.

Page boundaries:

- Overview: current judgement, why-not-closure, next watch, checkpoint.
- Market: pricing pattern and caveats, not forecast updates.
- News: candidate evidence handoff, not probability revision.
- Forecast: evidence -> mechanism -> judgement delta -> checkpoint.

## Ownership

Each task has one primary owner. Keep changes inside that scope.

- `contract`: `src/types/**`, `src/state/**`, `src/lib/forecast/**`,
  `src/data/sourceRegistry.ts`, non-UI `scripts/audit-*.mjs`.
- `forecast`: `src/pages/Forecast*`, `src/components/forecast/**`,
  Forecast story/replay/inspector UI.
- `product-surface`: `src/pages/Overview*`, `src/pages/Market*`,
  `src/pages/News*`, `src/components/layout/**`,
  `src/components/shared/**`, `src/components/map/**`, `src/styles/product.css`,
  UI copy/helpers, `scripts/audit-ui.mjs`.
- `data`: `data/**`, `scripts/fetch-*.mjs`, `scripts/run-*.mjs`,
  `docs/data.md`.
- `docs`: `README.md`, `docs/**`, `AGENTS.md`.
- `infra`: `package.json`, `vite.config.ts`, `tsconfig*.json`, build/lint
  setup.

High-conflict files:

```text
src/App.tsx
src/state/projections.ts
src/state/canonicalStore.ts
src/data.ts
src/styles.css
src/styles/product.css
package.json
vite.config.ts
README.md
docs/*
AGENTS.md
```

Before editing a high-conflict file, inspect its diff. Preserve peer work
unless the user explicitly asks otherwise.

## Git

Use git as coordination state.

- Start and end every task with `git status --short`.
- If remote/peer branches matter, `git fetch --all --prune` first.
- Do not pull or merge before understanding local dirty files.
- Commit only scoped task files when asked to commit.
- If versions differ, finish and verify your task first, then review and merge
  peer work.
- After merges or conflict resolution, rerun relevant checks.

For peer review:

```bash
git log --oneline --decorate --max-count=12 --all
git diff <base>...<peer-branch> --stat
git diff <base>...<peer-branch> -- <shared-paths>
```

## Verify

Default:

```bash
npm run lint
npm run build
npm run audit
```

Use targeted audits when scoped: `audit:data`, `audit:galaxy`,
`audit:evidence`, `audit:forecast`, `audit:replay`, `audit:legacy`,
`audit:ui`.

Do not claim a check passed unless it ran.

## Final Summary

Include:

- summary
- owner
- files touched
- verification
- git status / commit / merge state
- risks or next steps
