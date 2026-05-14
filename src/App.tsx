// Main reviewer-console shell for page selection and shared forecast target state.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AppHeader } from "./components/layout/AppHeader";
import { OverviewPage } from "./pages/OverviewPage";
import type { DetailPage } from "./types/ui";
import type { ForecastTarget } from "./types/forecast";

const MarketPage = lazy(() =>
  import("./pages/MarketPage").then((module) => ({ default: module.MarketPage })),
);
const NewsPage = lazy(() =>
  import("./pages/NewsPage").then((module) => ({ default: module.NewsPage })),
);
const ForecastPage = lazy(() =>
  import("./pages/ForecastPage").then((module) => ({ default: module.ForecastPage })),
);

function PageFallback({ label }: { label: string }) {
  return (
    <section className="page-grid">
      <div className="console-card page-loading-card">
        <strong>{label}</strong>
        <span>Loading page chunk...</span>
      </div>
    </section>
  );
}

function App() {
  const [selectedTarget, setSelectedTarget] = useState<ForecastTarget>("brent");
  const [activePage, setActivePage] = useState<DetailPage["id"]>("overview");
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
      {activePage === "market" ? (
        <Suspense fallback={<PageFallback label="市场数据" />}>
          <MarketPage />
        </Suspense>
      ) : null}
      {activePage === "news" ? (
        <Suspense fallback={<PageFallback label="事件发展" />}>
          <NewsPage />
        </Suspense>
      ) : null}
      {activePage === "forecast" ? (
        <Suspense fallback={<PageFallback label="Forecast Agent" />}>
          <ForecastPage selectedTarget={selectedTarget} onSelectTarget={setSelectedTarget} />
        </Suspense>
      ) : null}
    </main>
  );
}

export default App;
