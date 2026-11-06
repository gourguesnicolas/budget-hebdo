import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppState, Expense } from "../types";
import { isCustom, weekNumber, weekStats } from "../lib/budget";
import { DAYS, addDays, cap, daysBetween, fWd, fWdS, fm, iso, parse, range, shortDate } from "../lib/dates";
import { actions } from "../store";
import { SvgBars } from "../components/Charts";
import { Progress } from "../components/Progress";
import { CatOptions, parseAmount } from "../components/Dialogs";
import { useToast } from "../components/Toasts";
import { THEMES } from "../theme";
import { useMedia, useNarrow } from "../lib/useMedia";
import type { ThemeKey } from "../types";

export function ExpTable({ list, onEdit, onDelete }: { list: Expense[]; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  if (!list.length) return null;
  return (
    <div className="scroll explist"><table className="exp">
      <thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th className="n">Montant</th><th /></tr></thead>
      <tbody>{list.map(x => (
        <tr key={x.id}>
          <td className="d">{cap(fWdS.format(parse(x.date)))}</td>
          <td className="desc">{x.desc || <span className="hint">—</span>}</td>
          <td className="cat">{x.cat}</td>
          <td className="n"><b>{fm(x.amount)}</b></td>
          <td className="act">
            <button className="icon" title="Modifier" aria-label="Modifier" onClick={() => onEdit(x.id)}>✎</button>
            <button className="icon" title="Supprimer" aria-label="Supprimer" onClick={() => onDelete(x.id)}>🗑</button>
          </td>
        </tr>))}</tbody>
    </table></div>
  );
}

interface Props {
  state: AppState; wk: string; setWk: (wk: string) => void; themeKey: ThemeKey;
  draft: { cat: string; date: string }; setDraft: (d: { cat: string; date: string }) => void;
  onEditBudget: () => void; onEditExpense: (id: number) => void; onDeleteExpense: (id: number) => void;
}
export function WeekView({ state, wk, setWk, themeKey, draft, setDraft, onEditBudget, onEditExpense, onDeleteExpense }: Props) {
  const toast = useToast(), narrow = useNarrow();
  const touch = useMedia("(pointer: coarse)");          // pas d'ouverture automatique du clavier sur téléphone
  const st = weekStats(state, wk), wkn = weekNumber(st.start, state.payDay);
  const today = iso(new Date()), endIso = iso(st.end), isCur = today >= wk && today <= endIso;
  const b = st.budget, over = b == null ? 0 : Math.max(0, st.spent - b), rest = b == null ? 0 : Math.max(0, b - st.spent);
  const left = isCur ? daysBetween(today, endIso) + 1 : 0;
  const defaultDate = draft.date && draft.date >= wk && draft.date <= endIso ? draft.date : (isCur ? today : wk);

  /* formulaire d'ajout */
  const [amount, setAmount] = useState(""), [date, setDate] = useState(defaultDate), [desc, setDesc] = useState(""), [cat, setCat] = useState(draft.cat);
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDate(defaultDate); }, [wk]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (e: FormEvent): void => {
    e.preventDefault();
    const a = parseAmount(amount);
    if (!(a > 0) || !date) { toast("⚠ Entre un montant et une date valides."); return; }
    actions.addExpense({ amount: a, date, desc: desc.trim(), cat });
    setDraft({ cat, date }); setAmount(""); setDesc("");
    const target = iso(addDays(parse(date), -((parse(date).getDay() - state.payDay + 7) % 7)));
    if (target !== wk) toast("Dépense ajoutée à la semaine du " + shortDate(parse(target)) + ".", { label: "Voir", fn: () => setWk(target) });
    amountRef.current?.focus();
  };
  const first = (e: FormEvent): void => {
    e.preventDefault(); const a = parseAmount(new FormData(e.currentTarget as HTMLFormElement).get("amount"));
    if (!(a >= 0)) { toast("⚠ Montant invalide."); return; }
    actions.setDefaultBudget(wk, a); toast("Budget hebdomadaire enregistré.");
  };

  /* message de progression */
  let msg = "Définis ton budget pour suivre ta progression.", mc = "";
  if (b != null) {
    if (b === 0 && st.spent === 0) msg = "Budget à 0 $ : modifie-le pour suivre ta progression.";
    else if (st.spent > b) { msg = `⚠ Dépassement de ${fm(st.spent - b)} : tu es à ${Math.round(st.ratio * 100)} % du budget.`; mc = "bad"; }
    else if (st.ratio >= .9) msg = `Attention : il ne reste que ${fm(b - st.spent)} avant la limite.`;
    else msg = `Tout va bien : il te reste ${fm(b - st.spent)} pour la semaine.`;
  }
  const bad = b != null && st.spent > b;

  /* graphique par jour */
  const vals: number[] = [], labels: string[] = [];
  for (let i = 0; i < 7; i++) { const d = addDays(st.start, i), k = iso(d); vals.push(st.list.filter(x => x.date === k).reduce((s, x) => s + x.amount, 0)); labels.push(cap(fWd.format(d)).slice(0, 3)); }
  const pace = b != null ? b / 7 : null;

  return (
    <>
      <div className="weeknav wk">
        <button className="btn ghost nav-prev" aria-label="Semaine précédente" onClick={() => setWk(iso(addDays(parse(wk), -7)))}>◀</button>
        <div className="ttl"><b>Semaine {wkn.week}{isCur ? " · en cours" : ""}</b><span>{DAYS[state.payDay]} {range(st.start, st.end)} {st.start.getFullYear()} · paie le {shortDate(st.start)}</span></div>
        <input className="nav-date" type="date" value={wk} aria-label="Aller à la semaine contenant cette date" title="Aller à une date"
          onChange={e => { if (e.target.value) { const d = parse(e.target.value); setWk(iso(addDays(d, -((d.getDay() - state.payDay + 7) % 7)))); } }} />
        <button className="btn ghost nav-today" onClick={() => setWk(iso(addDays(new Date(), -((new Date().getDay() - state.payDay + 7) % 7))))}>Aujourd'hui</button>
        <button className="btn nav-next" aria-label="Semaine suivante" onClick={() => setWk(iso(addDays(parse(wk), 7)))}><span className="lbl">Semaine suivante </span>▶</button>
      </div>

      {!state.defaults.length && (
        <div className="card welcome"><h2>Bienvenue {THEMES[themeKey].emoji}</h2>
          <p>Commence par définir ton <b>budget loisirs hebdomadaire</b>. Tu pourras le changer pour une semaine précise à tout moment.</p>
          <form className="addform" onSubmit={first}><label>Budget par semaine ($)<input name="amount" type="number" min="0" step="0.01" required inputMode="decimal" placeholder="ex. 60" /></label><button className="btn">Enregistrer</button></form></div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="l">Budget alloué</div><div className="v">{b == null ? "—" : fm(b)}</div>
          <div className="s">{b == null ? "à définir" : (isCustom(state, wk) ? "✎ budget personnalisé" : "budget par défaut")} · <a href="#" style={{ color: "inherit" }} onClick={e => { e.preventDefault(); onEditBudget(); }}>modifier</a></div></div>
        <div className="kpi a"><div className="l">Dépensé</div><div className="v">{fm(st.spent)}</div><div className="s">{st.list.length} dépense{st.list.length > 1 ? "s" : ""} cette semaine</div></div>
        <div className="kpi g"><div className="l">Restant</div><div className="v">{fm(rest)}</div><div className="s">{isCur && rest > 0 && b != null ? "≈ " + fm(rest / left) + " par jour restant" : "—"}</div></div>
        <div className={"kpi r" + (bad ? " bad" : "")}><div className="l">Dépassement</div><div className="v">{fm(over)}</div><div className="s">{bad ? "Budget dépassé" : "Aucun dépassement"}</div></div>
      </div>

      <div className="card"><h2>Progression du budget</h2>
        <div className="flex"><span className="pct">{b == null ? "—" : Math.round(st.ratio * 100) + " %"}</span><span className="hint">{b == null ? "" : "du budget utilisé · " + fm(st.spent) + " sur " + fm(b)}</span></div>
        <Progress spent={st.spent} budget={b} /><div className={"msg " + mc}>{msg}</div></div>

      <div className="card"><h2>Ajouter une dépense</h2>
        <form data-form="add" className="addform expform" onSubmit={add}>
          <label>Montant ($)<input ref={amountRef} name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" placeholder="0,00" autoFocus={!touch} value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Date<input name="date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="grow">Description<input name="desc" type="text" maxLength={120} placeholder="ex. Café avec Marc" value={desc} onChange={e => setDesc(e.target.value)} /></label>
          <label>Catégorie<select name="cat" value={cat} onChange={e => setCat(e.target.value)}><CatOptions state={state} selected={cat} /></select></label>
          <button className="btn">Ajouter</button></form></div>

      <div className="row2">
        <div className="card"><h2>Dépenses par jour</h2>
          <SvgBars labels={labels} values={vals} colors={vals.map(v => (pace != null && v > pace ? "var(--cwarn)" : "var(--c2)"))} budgets={pace != null ? vals.map(() => pace) : null} w={narrow ? 320 : 440} h={narrow ? 190 : 210} valueLabels /></div>
        <div className="card"><h2>Détail de la semaine</h2>
          {st.list.length ? <ExpTable list={st.list} onEdit={onEditExpense} onDelete={onDeleteExpense} /> : <div className="empty">Aucune dépense pour le moment. {THEMES[themeKey].emoji}</div>}</div>
      </div>
    </>
  );
}
