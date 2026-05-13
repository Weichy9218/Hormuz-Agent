// Main reviewer-console shell for page selection and shared forecast target state.
import { useCallback, useEffect, useState } from "react";
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
  const selectPage = useCallback((page: DetailPage["id"]) => {
    setActivePage(page);
    window.history.replaceState(null, "", page === "overview" ? "/" : `/${page}`);
  }, []);

  useEffect(() => {
    const pageFromPath = (path: string): DetailPage["id"] => {
      if (path.startsWith("/market")) return "market";
      if (path.startsWith("/news")) return "news";
      if (path.startsWith("/forecast")) return "forecast";
      return "overview";
    };

    setActivePage(pageFromPath(window.location.pathname));
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      if (anchor.target || href.startsWith("//")) return;

      const nextUrl = new URL(href, window.location.origin);
      const nextPage = pageFromPath(nextUrl.pathname);
      event.preventDefault();
      setActivePage(nextPage);
      window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.hash}`);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  return (
    <main className="app-shell">
      <AppHeader
        activePage={activePage}
        onSelectPage={selectPage}
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
