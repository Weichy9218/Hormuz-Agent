# Forecast Agent Viewer Migration Plan

## Objective

Move the product center from a Hormuz risk dashboard to a Galaxy forecast-agent
run viewer. Forecast becomes the primary page; Overview, Market, and News are
supporting context.

## 2026-05-12 Status

Completed:

- Forecast became the primary page and default route.
- External `galaxy-selfevolve` execution was made non-blocking with
  `start/status/trace`.
- Live trace parsing now handles partial JSONL and keeps parallel tool calls
  under the same agent-turn parent.
- The repo now includes an independent local forecast-agent runtime under
  `scripts/forecast-agent/`.
- The local runtime writes graph-native `events.jsonl`, `trace.json`,
  `final_forecast.json`, `checkpoint.json`, and `run-artifact.json`.
- Forecast UI now starts the local agent by default and renders native graph
  nodes/edges when available.
- `audit:forecast-agent` checks the local runtime artifact, DAG, final forecast,
  checkpoint, parallel tool calls, and reviewer-safety guardrails.

Not completed:

- SSE is not implemented; the UI still polls `trace` every 1.5 seconds.
- The local agent is deterministic over source-backed artifacts. It does not yet
  run a live LLM ReAct loop inside this repo.
- The external Galaxy runner is retained as a compatibility path, not fully
  merged into the local runtime.
- UI Replay mode remains planned.
- React Flow layout is deterministic lane layout, not `dagre` / `elk`; this is
  intentional until graph size requires an auto-layout dependency.

## React Flow Fit Notes

The agent runtime should emit graph-native events. The UI should not infer DAG
semantics from raw logs. React Flow works best when:

- `nodes` and `edges` have stable ids.
- parent containers have explicit dimensions.
- node and edge types are defined outside render or memoized.
- live updates append events without remounting the whole canvas.
- high-frequency run status stays outside individual node data.

## Done When

- Forecast page starts from the Galaxy question and run status.
- The primary graph is generated from Galaxy action trace records, not a static
  risk summary.
- Timeline, graph, and inspector all share stable action ids.
- The runner uses `hormuz_test.yaml` and the existing Galaxy `.venv`.
- No raw chain-of-thought or internal prompts are shown.
- `judgement_updated` remains the only local forecast-state write event.

## Implementation Order

1. Add a `GalaxyActionTrace` schema and adapter over `main_agent.jsonl`,
   `checkpoint_note.json`, `main_agent_stats.json`, and tool artifact paths.
2. Update `scripts/run-galaxy-hormuz.mjs` to emit the action trace and create a
   minimal `hormuz_test.yaml` in the Galaxy repo when missing.
3. Replace the Forecast layout with a Galaxy run header, XYFlow action graph,
   action timeline, final forecast card, and trace inspector.
4. Set Forecast as the default app page and relabel the other tabs as context.
5. Add audit coverage for trace/action ids and run config metadata.

## Verification

- `npm run galaxy:hormuz -- --date 2026-05-12`
- `npm run audit:galaxy`
- `npm run lint`
- `npm run build`
- `npm run audit`
- Browser smoke check on `http://localhost:5173/` Forecast page.
