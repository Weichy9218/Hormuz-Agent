// Top-level application header and page navigation.
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  Box,
  CircleHelp,
  Gauge,
  Newspaper,
  RefreshCw,
  UserCircle,
} from "lucide-react";
import { detailPages } from "../../data";
import type { DetailPage } from "../../types/ui";

const pageIcon: Record<DetailPage["id"], LucideIcon> = {
  overview: Gauge,
  market: BarChart3,
  news: Newspaper,
  forecast: Activity,
};

const pageLabel: Record<DetailPage["id"], string> = {
  forecast: "Forecast Agent",
  overview: "背景总览",
  market: "市场背景",
  news: "事件背景",
};

export function AppHeader({
  activePage,
  onSelectPage,
}: {
  activePage: DetailPage["id"];
  onSelectPage: (page: DetailPage["id"]) => void;
}) {
  return (
    <header className="app-header">
      <div className="brand-mark" aria-label="Hormuz Risk Intelligence Agent">
        <span className="logo-cube">
          <Box size={22} />
        </span>
        <strong>Galaxy Forecast Agent Viewer</strong>
      </div>

      <nav className="page-tabs" aria-label="Workspace pages">
        {detailPages.map((page) => {
          const Icon = pageIcon[page.id];
          return (
            <button
              aria-label={pageLabel[page.id]}
              className={page.id === activePage ? "selected" : ""}
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              type="button"
            >
              <Icon size={15} />
              <span>{pageLabel[page.id]}</span>
            </button>
          );
        })}
      </nav>

      <div className="header-actions">
        <button aria-label="刷新" type="button">
          <RefreshCw size={19} />
        </button>
        <button aria-label="通知" type="button">
          <Bell size={20} />
        </button>
        <button aria-label="帮助" type="button">
          <CircleHelp size={20} />
        </button>
        <button aria-label="用户" type="button">
          <UserCircle size={22} />
        </button>
      </div>
    </header>
  );
}
