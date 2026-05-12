# AGENTS.md

## Working Style

- 默认用中文总结判断、取舍和结论；保留 API、schema、script、benchmark 等 English technical terms。
- 先读 `README.md`、`docs/design.md`、`docs/agent_visualization.md`，再改代码。
- 当前 dirty worktree 视为已有工作基础；不要回滚、重写或清理他人改动，除非用户明确要求。
- 改动保持小而可验证；不要做顺手 UI 重构、兼容层堆叠或 speculative abstraction。

## Product Boundary

- 本项目是 reviewer-facing forecast-agent deep case surface，不是新闻 dashboard、实时 AIS、交易建议或 LLM 调试台。
- 不引入 live data；不伪造 source、metric、probability、citation 或 sourceHash。
- Pending source 必须保持 pending caveat；pending source 不得生成 high-confidence live evidence。

## Forecast Contract

- Canonical data 从 `src/state/canonicalStore.ts` 进入，页面只通过 `src/state/projections.ts` 消费。
- `judgement_updated` 是唯一能改变 `scenarioDistribution` 或 `targetForecasts` 的事件。
- 每个 forecast update 必须能回溯：source observation -> evidence -> mechanism -> delta -> checkpoint。
- `TargetForecast.sourceIds` 只能是 `SourceRegistryEntry.id`；observation lineage 放在 `sourceObservationIds`。
- Replay-sensitive 输出必须 deterministic：current state、deltas、deltaAttribution、guardrails、sensitivity、PredictionRecord[]。

## Verification

- 代码改动后优先跑：

```bash
npm run lint
npm run build
npm run audit
```

- 如果只改 audit / forecast pipeline，至少跑相关 `npm run audit:*`，并说明未验证的剩余风险。
