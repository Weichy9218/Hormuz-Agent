// Structural Hormuz baseline facts used as reviewer anchors.
import { sourceBoundaryFacts } from "../data";
import { InfoTitle } from "./shared/InfoTitle";

export function HormuzBaselineStrip() {
  return (
    <section className="console-card baseline-strip">
      <InfoTitle title="为什么是 Hormuz" subtitle="结构性锚点，不代表实时 throughput" />
      <ul>
        {sourceBoundaryFacts
          .filter((fact) =>
            ["oil-flow", "bypass-capacity", "asia-exposure", "lng-relevance"].includes(fact.id),
          )
          .map((fact) => (
          <li key={fact.id}>
            <strong>{fact.value}</strong>
            <em>{fact.unit}</em>
            <p>{fact.label}</p>
            <small>{fact.detail}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
