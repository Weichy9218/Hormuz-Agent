// Small shared heading used by reviewer-console cards.
import { Info } from "lucide-react";

export function InfoTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="info-title">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <Info size={15} />
    </div>
  );
}
