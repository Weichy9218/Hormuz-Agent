// Top-level application header and page navigation.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Box,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
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
  overview: "背景总览",
  market: "市场数据",
  news: "事件发展",
  forecast: "Forecast Agent",
};

type HeaderPanel = "alerts" | "help" | "user";
type RefreshPhase = "idle" | "running" | "completed" | "failed";

interface LocalRefreshRun {
  status?: "running" | "completed" | "failed";
  startedAt?: string;
  lastUpdatedAt?: string;
  outputTail?: string;
  error?: string;
}

interface LocalRefreshStatus {
  ok?: boolean;
  started_at?: string;
  finished_at?: string;
  generated?: Record<string, string>;
  counts?: Record<string, number>;
  steps?: Array<{
    ok?: boolean;
    step?: string;
    error?: string;
  }>;
}

interface RefreshStatusResponse {
  active?: LocalRefreshRun | null;
  latest?: LocalRefreshStatus | null;
  error?: string;
}

function formatHeaderTime(value?: string | null) {
  if (!value) return "pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown refresh error";
}

export function AppHeader({
  activePage,
  onSelectPage,
}: {
  activePage: DetailPage["id"];
  onSelectPage: (page: DetailPage["id"]) => void;
}) {
  const [activePanel, setActivePanel] = useState<HeaderPanel | null>(null);
  const [refreshPhase, setRefreshPhase] = useState<RefreshPhase>("idle");
  const [refreshInfo, setRefreshInfo] = useState<RefreshStatusResponse>({});
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const loadRefreshStatus = useCallback(async () => {
    const response = await fetch("/api/local-data/refresh/status");
    const payload = (await response.json()) as RefreshStatusResponse;
    if (!response.ok) {
      throw new Error(payload.error || `Refresh status request failed: ${response.status}`);
    }
    setRefreshInfo(payload);
    setRefreshError(null);
    if (payload.active?.status === "running") {
      setRefreshPhase("running");
    } else if (payload.latest?.ok === false) {
      setRefreshPhase("failed");
    }
    return payload;
  }, []);

  useEffect(() => {
    void loadRefreshStatus().catch((error: unknown) => {
      setRefreshError(toErrorMessage(error));
    });
  }, [loadRefreshStatus]);

  useEffect(() => {
    if (refreshPhase !== "running") return undefined;
    const timer = window.setInterval(() => {
      void loadRefreshStatus()
        .then((payload) => {
          if (payload.active?.status === "running") return;
          setRefreshPhase(payload.latest?.ok === false ? "failed" : "completed");
        })
        .catch((error: unknown) => {
          setRefreshError(toErrorMessage(error));
          setRefreshPhase("failed");
        });
    }, 2200);
    return () => window.clearInterval(timer);
  }, [loadRefreshStatus, refreshPhase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const refreshCountRows = useMemo(
    () =>
      Object.entries(refreshInfo.latest?.counts ?? {})
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .slice(0, 4),
    [refreshInfo.latest],
  );
  const failedSteps = useMemo(
    () => refreshInfo.latest?.steps?.filter((step) => step.ok === false) ?? [],
    [refreshInfo.latest],
  );
  const latestGeneratedRows = useMemo(
    () =>
      Object.entries(refreshInfo.latest?.generated ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .slice(0, 3),
    [refreshInfo.latest],
  );

  const openPanel = (panel: HeaderPanel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const startRefresh = async () => {
    if (refreshPhase === "running") {
      setActivePanel("alerts");
      return;
    }
    setActivePanel("alerts");
    setRefreshError(null);
    setRefreshPhase("running");
    try {
      const response = await fetch("/api/local-data/refresh/start", { method: "POST" });
      const payload = (await response.json()) as RefreshStatusResponse;
      if (!response.ok) {
        throw new Error(payload.error || `Refresh request failed: ${response.status}`);
      }
      setRefreshInfo(payload);
    } catch (error: unknown) {
      setRefreshError(toErrorMessage(error));
      setRefreshPhase("failed");
    }
  };

  const statusState =
    refreshPhase === "running"
      ? "running"
      : refreshPhase === "failed" || refreshInfo.latest?.ok === false
        ? "failed"
        : refreshInfo.latest?.ok
          ? "ready"
          : "idle";

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
        <button
          aria-label="刷新本地数据"
          data-state={refreshPhase === "running" ? "running" : undefined}
          onClick={startRefresh}
          title="刷新本地数据"
          type="button"
        >
          <RefreshCw className={refreshPhase === "running" ? "spin" : undefined} size={19} />
        </button>
        <button
          aria-expanded={activePanel === "alerts"}
          aria-label="数据状态"
          className={activePanel === "alerts" ? "selected" : ""}
          onClick={() => openPanel("alerts")}
          title="数据状态"
          type="button"
        >
          <Bell size={20} />
        </button>
        <button
          aria-expanded={activePanel === "help"}
          aria-label="帮助"
          className={activePanel === "help" ? "selected" : ""}
          onClick={() => openPanel("help")}
          title="帮助"
          type="button"
        >
          <CircleHelp size={20} />
        </button>
        <button
          aria-expanded={activePanel === "user"}
          aria-label="工作台信息"
          className={activePanel === "user" ? "selected" : ""}
          onClick={() => openPanel("user")}
          title="工作台信息"
          type="button"
        >
          <UserCircle size={22} />
        </button>

        {activePanel ? (
          <div className="header-action-panel" role="dialog" aria-label="header action panel">
            <div className="header-panel-top">
              <strong>
                {activePanel === "alerts" ? "本地数据状态" : null}
                {activePanel === "help" ? "页面导航说明" : null}
                {activePanel === "user" ? "Reviewer workspace" : null}
              </strong>
              <button onClick={() => setActivePanel(null)} type="button">
                关闭
              </button>
            </div>

            {activePanel === "alerts" ? (
              <>
                <div className="header-panel-status" data-state={statusState}>
                  {statusState === "failed" ? <AlertTriangle size={18} /> : null}
                  {statusState === "running" ? <Clock3 size={18} /> : null}
                  {statusState === "ready" || statusState === "idle" ? <CheckCircle2 size={18} /> : null}
                  <div>
                    <strong>
                      {refreshPhase === "running"
                        ? "正在刷新本地数据"
                        : statusState === "failed"
                          ? "刷新状态需要检查"
                          : "本地快照可用"}
                    </strong>
                    <span>最近完成 {formatHeaderTime(refreshInfo.latest?.finished_at)}</span>
                  </div>
                </div>
                <p>
                  刷新按钮会在本地运行 <code>scripts/refresh-news.mjs</code>，更新事件、市场和总览所需的
                  <code> data/generated</code> 快照。
                </p>
                <div className="header-panel-metrics">
                  {refreshCountRows.length ? (
                    refreshCountRows.map(([key, value]) => (
                      <span key={key}>
                        {key.replaceAll("_", " ")}
                        <strong>{formatCount(value)}</strong>
                      </span>
                    ))
                  ) : (
                    <span>
                      counts
                      <strong>pending</strong>
                    </span>
                  )}
                </div>
                {latestGeneratedRows.length ? (
                  <ul className="header-panel-list">
                    {latestGeneratedRows.map(([key, value]) => (
                      <li key={key}>
                        <Database size={14} />
                        <span>{key.replaceAll("_", " ")}</span>
                        <strong>{formatHeaderTime(value)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {failedSteps.length ? (
                  <p className="header-panel-warning">{failedSteps.length} 个 refresh step 失败，打开终端日志复核。</p>
                ) : null}
                {refreshError ? <p className="header-panel-warning">{refreshError}</p> : null}
              </>
            ) : null}

            {activePanel === "help" ? (
              <>
                <p>建议阅读顺序：背景总览 → 市场数据 → 事件发展 → Forecast Agent。</p>
                <ul className="header-panel-list">
                  <li>
                    <CheckCircle2 size={14} />
                    <span>地图是 P0 local context layer，不接入实时 AIS。</span>
                  </li>
                  <li>
                    <CheckCircle2 size={14} />
                    <span>背景页只展示 sourced snapshot，不生成预测概率。</span>
                  </li>
                  <li>
                    <CheckCircle2 size={14} />
                    <span>Forecast Agent 保持独立 live viewer 边界。</span>
                  </li>
                </ul>
              </>
            ) : null}

            {activePanel === "user" ? (
              <>
                <p>当前是本地 reviewer console，会优先展示可复核的背景材料。</p>
                <div className="header-panel-metrics">
                  <span>
                    page
                    <strong>{pageLabel[activePage]}</strong>
                  </span>
                  <span>
                    mode
                    <strong>local</strong>
                  </span>
                </div>
                <ul className="header-panel-list">
                  <li>
                    <Database size={14} />
                    <span>Data source</span>
                    <strong>generated snapshots</strong>
                  </li>
                  <li>
                    <Clock3 size={14} />
                    <span>Last refresh</span>
                    <strong>{formatHeaderTime(refreshInfo.latest?.finished_at)}</strong>
                  </li>
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
