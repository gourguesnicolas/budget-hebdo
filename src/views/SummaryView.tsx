import type { ReactNode } from "react";
import type { AppState, ThemeKey } from "../types";
import { summaryData, weekNumber } from "../lib/budget";
import { MONTHS, fm, parse, range } from "../lib/dates";
import { SvgBars } from "../components/Charts";
import { THEMES } from "../theme";

const Kpi = ({ cls, l, v, s }: { cls: string; l: string; v: ReactNode; s: ReactNode }) => <div className={"kpi " + cls}><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div>;

export function SummaryView({ state, year, setYear, setWk, goWeek, themeKey }: {
  state: AppState; year: number; setYear: (y: number) => void; setWk: (wk: string) => void; goWeek: () => void; themeKey: ThemeKey;
}) {
  const wn = (d: Date): number => weekNumber(d, state.payDay).week;
  const yNow = weekNumber(new Date(), state.payDay).year;
  const years = new Set<number>([yNow, year]); state.expenses.forEach(x => years.add(weekNumber(parse(x.date), state.payDay).year));
  const yl = [...years].sort((a, b) => b - a);
  const head = (
    <div className="weeknav"><div className="ttl"><b>Résumé annuel</b><span>Statistiques sur les semaines suivies jusqu'à aujourd'hui</span></div>
      <label>Année<select value={year} onChange={e => setYear(Number(e.target.value))}>{yl.map(y => <option key={y}>{y}</option>)}</select></label></div>
  );
  if (!state.defaults.length) return <>{head}<div className="card empty">Définis d'abord un budget hebdomadaire dans l'onglet « Semaine ».</div></>;
  const { weeks, todayWk } = summaryData(state, year);
  if (!weeks.length) return <>{head}<div className="card empty">Aucune semaine suivie en {year}. {THEMES[themeKey].emoji}</div></>;

  const status = (w: { spent: number; budget: number | null }): "over" | "ok" => (w.spent > (w.budget ?? 0) ? "over" : "ok");
  const B = (w: { budget: number | null }): number => w.budget ?? 0;
  const ok = weeks.filter(w => status(w) === "ok").length, ov = weeks.length - ok;
  const budget = weeks.reduce((s, w) => s + B(w), 0), spent = weeks.reduce((s, w) => s + w.spent, 0);
  const best = weeks.reduce((a, w) => (B(w) - w.spent > B(a) - a.spent ? w : a));
  const worst = weeks.reduce((a, w) => (w.spent - B(w) > a.spent - B(a) ? w : a));
  let streak = 0; for (let i = weeks.length - 1; i >= 0; i--) { if (status(weeks[i]) === "ok") streak++; else break; }
  const all = weeks.flatMap(w => w.list);
  const maxE = all.reduce<(typeof all)[number] | null>((a, x) => (!a || x.amount > a.amount ? x : a), null);
  const wlabel = (w: (typeof weeks)[number]): string => "Sem. " + wn(w.start) + " (" + range(w.start, w.end) + ")";
  const s = (n: number): string => (n > 1 ? "s" : "");
  const mv = new Array<number>(12).fill(0); all.forEach(x => { mv[+x.date.slice(5, 7) - 1] += x.amount; });
  const cm: Record<string, number> = {}; all.forEach(x => { const k = x.cat || "Sans catégorie"; cm[k] = (cm[k] || 0) + x.amount; });
  const ce = Object.entries(cm).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {head}
      <div className="kpis">
        <Kpi cls="" l="Budget alloué" v={fm(budget)} s={`${weeks.length} semaine${s(weeks.length)} suivie${s(weeks.length)}`} />
        <Kpi cls="a" l="Total dépensé" v={fm(spent)} s={"Moy. " + fm(spent / weeks.length) + " / semaine"} />
        <Kpi cls="g" l="Économies nettes" v={fm(budget - spent)} s={budget - spent >= 0 ? "Sous le budget" : "Au-dessus du budget"} />
        <Kpi cls="r" l="Taux de réussite" v={Math.round(ok / weeks.length * 100) + " %"} s={`${ok} respectée${s(ok)} sur ${weeks.length}`} />
        <Kpi cls="g" l="Semaines respectées" v={ok} s="Budget non dépassé" />
        <Kpi cls={"r" + (ov ? " bad" : "")} l="Semaines dépassées" v={ov} s="Budget dépassé" />
        <Kpi cls="a" l="Meilleure semaine" v={fm(Math.max(0, B(best) - best.spent))} s={wlabel(best)} />
        <Kpi cls="r" l="Pire dépassement" v={fm(Math.max(0, worst.spent - B(worst)))} s={worst.spent > B(worst) ? wlabel(worst) : "Aucun dépassement"} />
        <Kpi cls="" l="Série en cours" v={streak + " sem."} s="semaines respectées de suite" />
        <Kpi cls="a" l="Nombre de dépenses" v={all.length} s={all.length ? "Moy. " + fm(spent / all.length) + " par achat" : "—"} />
        <Kpi cls="g" l="Plus grosse dépense" v={fm(maxE ? maxE.amount : 0)} s={maxE ? maxE.desc || "Sans description" : "—"} />
      </div>

      <div className="row2">
        <div className="card"><h2>Dépenses par mois</h2><SvgBars labels={[...MONTHS]} values={mv} colors={mv.map(() => "var(--c1)")} w={440} h={220} valueLabels /></div>
        <div className="card"><h2>Répartition par catégorie</h2>
          {ce.length ? ce.map(([k, v]) => (
            <div className="catbar" key={k}><span>{k}</span><span className="t"><i style={{ width: (spent > 0 ? v / spent * 100 : 0) + "%" }} /></span><span className="a">{fm(v)} · {Math.round(spent > 0 ? v / spent * 100 : 0)} %</span></div>
          )) : <div className="empty">Aucune dépense.</div>}
        </div>
      </div>

      <div className="card"><h2>Budget vs dépensé, semaine par semaine</h2>
        <SvgBars labels={weeks.map(w => "S" + wn(w.start))} values={weeks.map(w => w.spent)} budgets={weeks.map(B)} colors={weeks.map(w => (w.spent > B(w) ? "var(--cbad)" : "var(--c2)"))}
          w={720} h={230} labelEvery={weeks.length > 26 ? 3 : weeks.length > 14 ? 2 : 1} titles={weeks.map(wlabel)} />
        <div className="hint">Barres : dépensé (rouge si dépassé) · tirets rouges : budget de la semaine</div></div>

      <div className="card"><h2>Semaine par semaine</h2><div className="scroll"><table>
        <thead><tr><th>Sem.</th><th>Période</th><th className="n">Budget</th><th className="n">Dépensé</th><th className="n">Écart</th><th>Utilisation</th><th>Statut</th><th /></tr></thead>
        <tbody>{weeks.slice().reverse().map(w => {
          const cur = w.wk === todayWk, st = status(w), r = Math.min(100, w.ratio * 100);
          return (
            <tr key={w.wk}>
              <td><b>S{wn(w.start)}</b></td><td className="cat">{range(w.start, w.end)}</td><td className="n">{fm(w.budget)}</td><td className="n">{fm(w.spent)}</td>
              <td className="n" style={st === "over" ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{fm(B(w) - w.spent)}</td>
              <td><span className="mini"><i className={st === "over" ? "over" : ""} style={{ width: r + "%" }} /></span> <span className="hint">{Math.round(w.ratio * 100)} %</span></td>
              <td><span className={"chip " + (st === "over" ? "over" : cur ? "cur" : "ok")}>{st === "over" ? "Dépassé" : cur ? "En cours" : "Respecté"}</span></td>
              <td><button className="btn ghost sm" onClick={() => { setWk(w.wk); goWeek(); }}>Voir</button></td>
            </tr>);
        })}</tbody>
      </table></div></div>
    </>
  );
}
