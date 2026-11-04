import { useEffect, useRef, type FormEvent } from "react";
import type { AppState } from "../types";
import { budgetFor, isCustom } from "../lib/budget";
import { parse, shortDate } from "../lib/dates";
import { actions } from "../store";
import { useToast } from "./Toasts";

export const parseAmount = (v: FormDataEntryValue | null): number => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

export function CatOptions({ state, selected }: { state: AppState; selected: string }) {
  const list = state.categories.includes(selected) || !selected ? state.categories : [...state.categories, selected];
  return <><option value="">— Aucune —</option>{list.map(c => <option key={c} value={c}>{c}</option>)}</>;
}

export function ExpenseDialog({ state, id, onClose }: { state: AppState; id: number; onClose: () => void }) {
  const toast = useToast();
  const x = state.expenses.find(e => e.id === id);
  if (!x) return null;
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    const amount = parseAmount(fd.get("amount")), date = String(fd.get("date") || "");
    if (!(amount > 0) || !date) { toast("⚠ Entre un montant et une date valides."); return; }
    actions.updateExpense(id, { amount, date, desc: String(fd.get("desc") || "").trim(), cat: String(fd.get("cat") || "") });
    onClose(); toast("Dépense modifiée.");
  };
  const del = (): void => {
    const removed = actions.removeExpense(id); onClose();
    if (removed) toast("Dépense supprimée.", { label: "Annuler", fn: () => actions.restoreExpense(removed) });
  };
  return (
    <form data-form="edit" onSubmit={submit}>
      <h3>Modifier la dépense</h3>
      <label>Montant ($)<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={x.amount} /></label>
      <label>Date<input name="date" type="date" required defaultValue={x.date} /></label>
      <label>Description<input name="desc" maxLength={120} defaultValue={x.desc} /></label>
      <label>Catégorie<select name="cat" defaultValue={x.cat}><CatOptions state={state} selected={x.cat} /></select></label>
      <div className="flex">
        <button className="btn">Enregistrer</button>
        <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn danger" style={{ marginLeft: "auto" }} onClick={del}>Supprimer</button>
      </div>
    </form>
  );
}

export function BudgetDialog({ state, wk, onClose }: { state: AppState; wk: string; onClose: () => void }) {
  const toast = useToast(), inp = useRef<HTMLInputElement>(null), b = budgetFor(state, wk);
  useEffect(() => { const t = setTimeout(() => { inp.current?.focus(); inp.current?.select(); }, 30); return () => clearTimeout(t); }, []);
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault(); const fd = new FormData(e.currentTarget), amount = parseAmount(fd.get("amount"));
    if (!(amount >= 0)) { toast("⚠ Montant invalide."); return; }
    actions.setWeekBudget(wk, amount, !!fd.get("makeDefault")); onClose(); toast("Budget enregistré.");
  };
  return (
    <form data-form="budget" onSubmit={submit}>
      <h3>Budget de la semaine du {shortDate(parse(wk))}</h3>
      <label>Montant ($)<input ref={inp} name="amount" type="number" min="0" step="0.01" required inputMode="decimal" defaultValue={b ?? ""} /></label>
      <label className="chk"><input type="checkbox" name="makeDefault" /> Utiliser aussi ce montant pour les semaines suivantes</label>
      <div className="flex">
        <button className="btn">Enregistrer</button>
        <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
        {isCustom(state, wk) && <button type="button" className="btn ghost" onClick={() => { actions.resetWeekBudget(wk); onClose(); toast("Budget par défaut rétabli."); }}>Revenir au défaut</button>}
      </div>
    </form>
  );
}
