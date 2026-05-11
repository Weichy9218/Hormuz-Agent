// Small label helper shared by Forecast components and the page runner.
import type { AgentRunEvent } from "../../types/agentEvents";

export const eventTypeTitle: Record<AgentRunEvent["type"], string> = {
  run_started: "运行开始",
  source_read: "固定信源",
  evidence_added: "新证据",
  judgement_updated: "判断修订",
  checkpoint_written: "写回",
  run_completed: "运行完成",
};

export function getRunEventTitle(type: AgentRunEvent["type"]) {
  return eventTypeTitle[type];
}
