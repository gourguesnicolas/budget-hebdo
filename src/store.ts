import { useSyncExternalStore } from "react";
import type { AppState, Expense, ThemeChoice } from "./types";
import { freshState, isExpense, migrate, newId, withDefault } from "./lib/budget";
import { loadState, saveLocal } from "./lib/storage";
import { CloudSync } from "./sync/engine";

/** Store minimal : l'état de l'application est un objet immuable, sauvegardé dans le navigateur à chaque changement. */
class Store {
  private state: AppState = loadState();
  private listeners = new Set<() => void>();
  readonly cloud: CloudSync = new CloudSync({ getState: () => this.state, applyRemote: fn => this.set(fn(this.state), true) });

  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getState = (): AppState => this.state;

  /** Changement fait par l'utilisateur : sauvegardé localement puis envoyé au cloud. */
  update(fn: (s: AppState) => AppState): void { this.set(fn(this.state), false); }
  private set(next: AppState, remote: boolean): void {
    if (next === this.state) return;
    this.state = next; saveLocal(next);
    this.listeners.forEach(l => l());
    if (!remote) this.cloud.notifyLocalChange();
  }
}
export const store = new Store();
export const useAppState = (): AppState => useSyncExternalStore(store.subscribe, store.getState);

/* ---- actions ---- */
export type ExpenseInput = Omit<Expense, "id">;
const without = (w: AppState["weeks"], wk: string): AppState["weeks"] => {
  const { [wk]: cur, ...rest } = w; if (!cur) return w;
  const { budget: _b, ...others } = cur; void _b;
  return Object.keys(others).length ? { ...rest, [wk]: others } : rest;
};
export const actions = {
  addExpense: (e: ExpenseInput): void => store.update(s => ({ ...s, expenses: [...s.expenses, { id: newId(), ...e }] })),
  updateExpense: (id: number, e: ExpenseInput): void => store.update(s => ({ ...s, expenses: s.expenses.map(x => (x.id === id ? { id, ...e } : x)) })),
  removeExpense(id: number): Expense | undefined {
    const x = store.getState().expenses.find(e => e.id === id); if (!x) return undefined;
    store.update(s => ({ ...s, expenses: s.expenses.filter(e => e.id !== id) })); return x;
  },
  restoreExpense: (x: Expense): void => store.update(s => ({ ...s, expenses: [...s.expenses, x] })),
  setWeekBudget: (wk: string, amount: number, makeDefault: boolean): void => store.update(s => makeDefault
    ? { ...withDefault(s, wk, amount), weeks: without(s.weeks, wk) }
    : { ...s, weeks: { ...s.weeks, [wk]: { ...s.weeks[wk], budget: amount } } }),
  resetWeekBudget: (wk: string): void => store.update(s => ({ ...s, weeks: without(s.weeks, wk) })),
  setDefaultBudget: (from: string, amount: number): void => store.update(s => withDefault(s, from, amount)),
  addCategory: (name: string): boolean => {
    if (store.getState().categories.includes(name)) return false;
    store.update(s => ({ ...s, categories: [...s.categories, name] })); return true;
  },
  removeCategory: (i: number): void => store.update(s => ({ ...s, categories: s.categories.filter((_, k) => k !== i) })),
  setTheme: (theme: ThemeChoice): void => store.update(s => ({ ...s, theme })),
  setFx: (fx: boolean): void => store.update(s => ({ ...s, fx })),
  setPayDay: (d: number): void => store.update(s => migrate(s, d)),
  markExported: (): void => store.update(s => ({ ...s, lastExport: new Date().toISOString() })),
  eraseAll: (): void => store.update(s => ({ ...freshState(), theme: s.theme, fx: s.fx })),
  /** Remplace tout par le contenu d'une sauvegarde JSON. Retourne le nombre de dépenses importées, ou null si le fichier est invalide. */
  importJson(raw: string): number | null {
    try {
      const j = JSON.parse(raw) as Partial<AppState>;
      if (!j || !Array.isArray(j.expenses) || !j.expenses.every(isExpense)) return null;
      if (typeof j.payDay !== "number") j.payDay = 1;
      store.update(s => {
        const n = migrate({ ...freshState(), ...j } as AppState);
        return { ...n, theme: s.theme, fx: s.fx, expenses: n.expenses.map(x => ({ ...x, id: x.id || newId(), desc: x.desc || "", cat: x.cat || "" })) };
      });
      return j.expenses.length;
    } catch { return null; }
  }
};
