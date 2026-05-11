# Hormuz Risk Intelligence Interface

Forecast-first demo for showing how a risk agent revises judgement after new evidence.

## What This Is

This project is not a Hormuz news dashboard. It is a judgement revision interface:

```text
evidence -> mechanism -> judgement_updated -> checkpoint
```

The single design source is [docs/design.md](docs/design.md).

## Current Direction

- Keep three top-level pages: Overview, Market, Forecast.
- Make Forecast the primary surface for agent behavior.
- Demote Routes/map to supporting context.
- Replace `WarTrend` state with probability forecast targets.
- Keep pending data explicit: Gold, AIS, and commercial flow are not live evidence until sourced.

## Run

```bash
npm install
npm run dev -- --port 5173
```

Default local URL:

```text
http://localhost:5173/
```

## Verify

```bash
npm run build
npm run lint
npm run audit:data
```
