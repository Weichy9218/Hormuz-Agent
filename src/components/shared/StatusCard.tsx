// Reusable status summary card for page-level metrics.
import type { LucideIcon } from "lucide-react";
import { InfoTitle } from "./InfoTitle";

export function StatusCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="console-card status-card">
      <span className="icon-well">
        <Icon size={27} />
      </span>
      <div>
        <InfoTitle title={title} />
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}
