import { fm } from "../lib/dates";

export function Progress({ spent, budget }: { spent: number; budget: number | null }) {
  if (budget == null) return null;
  const over = spent > budget;
  const scale = over ? spent : (budget > 0 ? budget : 1);
  const fillPct = budget > 0 ? Math.min(spent, budget) / scale * 100 : 0;
  const overPct = over ? (spent - budget) / scale * 100 : 0;
  const mark = over ? (spent > 0 ? budget / scale * 100 : 100) : 100;
  const ratio = budget > 0 ? spent / budget : (spent > 0 ? 9.99 : 0);
  const cls = over ? "red" : ratio >= .9 ? "hot" : ratio >= .6 ? "warm" : "ok";
  const tr = mark > 85 ? "translateX(-100%)" : (mark < 15 ? "none" : "translateX(-50%)");
  return (
    <div className="pwrap">
      <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(ratio * 100))} aria-label="Progression du budget de la semaine">
        <div className={"pfill " + cls} style={{ width: fillPct + "%" }} />
        {over && <div className="pover" style={{ left: mark + "%", width: overPct + "%" }} />}
        <div className="pmark" style={{ left: mark + "%" }} />
      </div>
      <div className="plabels">
        <span>0 $</span>
        <span className="pm" style={{ left: mark + "%", transform: tr }}>Budget {fm(budget)}</span>
        {over && <span className="pm" style={{ right: 0, color: "var(--danger)" }}>+{fm(spent - budget)}</span>}
      </div>
    </div>
  );
}
