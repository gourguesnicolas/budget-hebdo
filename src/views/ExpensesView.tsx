import { useMemo, useState } from "react";
import type { AppState } from "../types";
import { fm } from "../lib/dates";
import { ExpTable } from "./WeekView";

export function ExpensesView({ state, onEdit, onDelete }: { state: AppState; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  const [q, setQ] = useState(""), [year, setYear] = useState(""), [cat, setCat] = useState("");
  const years = useMemo(() => [...new Set(state.expenses.map(x => x.date.slice(0, 4)))].sort().reverse(), [state.expenses]);
  const cats = useMemo(() => [...new Set([...state.categories, ...state.expenses.map(x => x.cat).filter(Boolean)])], [state.categories, state.expenses]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.expenses.filter(x => (!year || x.date.startsWith(year)) && (!cat || x.cat === cat) && (!t || (x.desc + " " + x.cat).toLowerCase().includes(t)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }, [state.expenses, q, year, cat]);
  const total = list.reduce((s, x) => s + x.amount, 0), shown = list.slice(0, 500);
  return (
    <>
      <div className="card"><h2>Toutes les dépenses</h2>
        <div className="flex" style={{ marginBottom: 12 }}>
          <label style={{ flex: 1, minWidth: 180 }}>Recherche<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Description ou catégorie" /></label>
          <label>Année<select value={year} onChange={e => setYear(e.target.value)}><option value="">Toutes</option>{years.map(y => <option key={y}>{y}</option>)}</select></label>
          <label>Catégorie<select value={cat} onChange={e => setCat(e.target.value)}><option value="">Toutes</option>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
        <div>
          <div className="hint" style={{ marginBottom: 8 }}>{list.length} dépense{list.length > 1 ? "s" : ""} · total <b>{fm(total)}</b>{list.length > 500 ? " · 500 plus récentes affichées" : ""}</div>
          {shown.length ? <ExpTable list={shown} onEdit={onEdit} onDelete={onDelete} /> : <div className="empty">Aucune dépense pour le moment.</div>}
        </div>
      </div>
      <p className="hint">Pour ajouter une dépense, va dans l'onglet « Semaine ».</p>
    </>
  );
}
