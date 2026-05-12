// Main reviewer-console shell for page selection and shared forecast target state.
import { useMemo, useState } from "react";
import { AppHeader } from "./components/layout/AppHeader";
import { sourceBoundaryFacts } from "./data";
import { ForecastPage } from "./pages/ForecastPage";
import { MarketPage } from "./pages/MarketPage";
import { NewsTimelinePage } from "./pages/NewsTimelinePage";
import { OverviewPage } from "./pages/OverviewPage";
import { scenarioOrder } from "./state/forecastStore";
import { projectOverviewState } from "./state/projections";
import type { DetailPage } from "./types";
import type { ForecastTarget } from "./types/forecast";

function App() {
  const [selectedTarget, setSelectedTarget] = useState<ForecastTarget>("brent");
  const [activePage, setActivePage] = useState<DetailPage["id"]>("overview");

  // Compute base case from the canonical projection (single source of truth).
  const baseCaseScenarioId = useMemo(() => {
    const distribution = projectOverviewState(
      sourceBoundaryFacts.map((f) => ({ ...f })),
    ).scenarioDistribution;
    return scenarioOrder.reduce((best, current) =>
      distribution[current] > distribution[best] ? current : best,
    );
  }, []);

  return (
    <main className="app-shell">
      <AppHeader
        activePage={activePage}
        onSelectPage={setActivePage}
        baseCaseScenarioId={baseCaseScenarioId}
      />

      {activePage === "overview" ? <OverviewPage /> : null}
      {activePage === "market" ? <MarketPage /> : null}
      {activePage === "news" ? <NewsTimelinePage /> : null}
      {activePage === "forecast" ? (
        <ForecastPage selectedTarget={selectedTarget} onSelectTarget={setSelectedTarget} />
      ) : null}
    </main>
  );
}

export default App;
