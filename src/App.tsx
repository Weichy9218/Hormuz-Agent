// Main reviewer-console shell for page selection and shared forecast target state.
import { useState } from "react";
import { AppHeader } from "./components/layout/AppHeader";
import { ForecastPage } from "./pages/ForecastPage";
import { MarketPage } from "./pages/MarketPage";
import { NewsPage } from "./pages/NewsPage";
import { OverviewPage } from "./pages/OverviewPage";
import type { DetailPage } from "./types/ui";
import type { ForecastTarget } from "./types/forecast";

function App() {
  const [selectedTarget, setSelectedTarget] = useState<ForecastTarget>("brent");
  const [activePage, setActivePage] = useState<DetailPage["id"]>("forecast");

  return (
    <main className="app-shell">
      <AppHeader
        activePage={activePage}
        onSelectPage={setActivePage}
      />

      {activePage === "overview" ? <OverviewPage /> : null}
      {activePage === "market" ? <MarketPage /> : null}
      {activePage === "news" ? <NewsPage /> : null}
      {activePage === "forecast" ? (
        <ForecastPage selectedTarget={selectedTarget} onSelectTarget={setSelectedTarget} />
      ) : null}
    </main>
  );
}

export default App;
